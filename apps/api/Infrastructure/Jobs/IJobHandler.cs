namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// Domain logic for one versioned <c>job_type</c>. Implementations live with their
/// domain slice (e.g. session cleanup in Modules/Auth/Jobs), keeping the engine
/// domain-agnostic.
///
/// The execution contract (design §5.1/§6):
/// - **At-least-once.** A handler may re-run after a crash between a side effect and
///   the completing delete, or after a lost lease. Every implementation MUST be
///   idempotent — natural idempotency, an enqueue idempotency key, or a domain
///   outcome marker (asserted per handler in specs).
/// - **Versioned types (F14).** A version's handler is never removed in the same
///   release that stops producing its <see cref="JobType"/>: it stays until the
///   queue and DLQ are drained of that version.
/// </summary>
public interface IJobHandler {
	/// <summary>
	/// Stable, versioned dispatch key (e.g. "email.tenant-invitation.v1") matched
	/// against job_queue.job_type. Exactly one handler per key — enforced fail-fast
	/// by <see cref="JobHandlerRegistry"/>.
	/// </summary>
	string JobType { get; }

	/// <summary>
	/// Executes one job and reports a typed <see cref="JobOutcome"/>.
	/// <paramref name="cancellationToken"/> fires ONLY for host shutdown or a lost
	/// lease — propagate it (throw); the run is abandoned cleanly, does not consume
	/// an attempt, and is never dead-lettered. A cancellation the handler observes
	/// from anywhere else (e.g. a provider HTTP timeout) is a job failure, not a
	/// shutdown: return <see cref="JobOutcome.Retry"/>, or let the engine classify
	/// the foreign OperationCanceledException as a retry.
	/// </summary>
	Task<JobOutcome> HandleAsync(JobContext context, CancellationToken cancellationToken);

	/// <summary>
	/// Invoked by the engine INSIDE the terminal-failure transaction, immediately
	/// before the job is copied to job_dead_letter and deleted (F5) — e.g. email
	/// handlers write email_log(PermanentlyFailed) here. A throw rolls back the
	/// whole terminal step; the still-leased row is retried whole after lease
	/// expiry. <paramref name="context"/>.LastError carries the final classified
	/// error.
	/// </summary>
	Task OnTerminalFailureAsync(JobContext context, CancellationToken cancellationToken) {
		return Task.CompletedTask;
	}
}
