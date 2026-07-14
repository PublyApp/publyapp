namespace PublyApp.Api.Infrastructure.Messaging.Email;

/// <summary>
/// Lets invitation-creation services wake InvitationEmailOutboxDispatcher immediately
/// after committing new outbox rows, instead of the dispatcher only discovering them on
/// its next poll tick. Purely a latency optimization: if Notify() is never called (or
/// races the dispatcher), the dispatcher's own poll-interval timeout still picks the
/// row up, so correctness never depends on this signal firing.
/// </summary>
public interface IInvitationEmailOutboxSignal {
	void Notify();

	Task WaitAsync(TimeSpan timeout, CancellationToken cancellationToken);
}

public sealed class InvitationEmailOutboxSignal : IInvitationEmailOutboxSignal {
	private readonly SemaphoreSlim _semaphore = new(0, 1);

	public void Notify() {
		try {
			_semaphore.Release();
		} catch (SemaphoreFullException) {
			// A wakeup is already pending; the dispatcher will pick up this batch too.
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
