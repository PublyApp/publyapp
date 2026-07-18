namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// Cross-process wake seam (design §5.5, O2). Same shape as the shipped
/// <c>IInvitationEmailOutboxSignal</c>, but backed by Postgres LISTEN/NOTIFY instead of
/// an in-process semaphore: producers emit a transactional <c>NOTIFY job_queue</c> at
/// commit (via the enqueuer), a worker-side <see cref="JobQueueListener"/> receives it
/// and calls <see cref="Notify"/>, and the processor's loop waits on
/// <see cref="WaitAsync"/> so it wakes immediately instead of only on the poll tick. The
/// poll timeout remains the correctness fallback — a dropped NOTIFY (no listener at
/// commit) is still picked up within the interval. Kept as an interface so specs can
/// inject a deterministic fake.
/// </summary>
public interface IJobQueueSignal {
	/// <summary>Wakes a single pending waiter; coalesces (extra notifies collapse to one).</summary>
	void Notify();

	/// <summary>Waits for a wake or the timeout (the poll fallback), whichever comes first.</summary>
	Task WaitAsync(TimeSpan timeout, CancellationToken cancellationToken);
}

/// <summary>
/// Default <see cref="IJobQueueSignal"/> — a <see cref="SemaphoreSlim"/> whose
/// "one pending wake is enough" collapsing preserves the shipped dispatcher's
/// coalescing (design §5.5 failure analysis (d)).
/// </summary>
public sealed class JobQueueSignal : IJobQueueSignal {
	private readonly SemaphoreSlim _semaphore = new(0, 1);

	public void Notify() {
		try {
			_semaphore.Release();
		} catch (SemaphoreFullException) {
			// A wake is already pending; the processor's next drain covers this batch too.
		}
	}

	public async Task WaitAsync(TimeSpan timeout, CancellationToken cancellationToken) {
		try {
			await _semaphore.WaitAsync(timeout, cancellationToken);
		} catch (OperationCanceledException) {
			// Host shutdown; the caller re-checks its own stopping token.
		}
	}
}
