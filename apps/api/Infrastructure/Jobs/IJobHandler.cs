namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// Domain logic for one <c>job_type</c>. Implementations live with their domain
/// slice (e.g. session cleanup in Modules/Auth/Jobs), keeping the engine
/// domain-agnostic. Each handler MUST be idempotent: the queue is at-least-once, so a
/// handler may re-run after a crash between a side effect and the completing delete
/// (design §6, hard contract asserted per handler in specs).
/// </summary>
public interface IJobHandler {
	// Stable dispatch key matched against JobQueueItem.JobType. Exactly one handler
	// per key (enforced by JobHandlerRegistry).
	string JobType { get; }

	Task HandleAsync(JobContext context, CancellationToken cancellationToken);
}
