namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// Staff trigger-now seam (#636): turns "run this system job now" into the SAME
/// <see cref="PublyApp.Api.Infrastructure.Jobs.Quartz.EnqueueSystemJobJob.EnqueueOccurrenceAsync"/>
/// call the cron trigger uses, so every engine fence (schedule-epoch match,
/// occurrence uniqueness, atomic ledger + queue insert) applies unchanged.
/// </summary>
public interface IEnqueueSystemJobBoundary {
	/// <summary>
	/// Enqueues one occurrence of <paramref name="jobKey"/> firing now. Never
	/// rotates the schedule epoch — rotation belongs exclusively to cron updates.
	/// </summary>
	Task<BoundaryResult> EnqueueNowAsync(
		string jobKey,
		CancellationToken cancellationToken
	);
}

/// <summary>
/// Discriminated outcome of a trigger-now attempt. Handlers translate each
/// variant to its own HTTP verdict; the boundary never throws for expected
/// states.
/// </summary>
public abstract record BoundaryResult {
	/// <summary>No live definition carries this job_key.</summary>
	public sealed record NotFound : BoundaryResult;

	/// <summary>
	/// Nothing was enqueued: the key is known but disabled (or was disabled
	/// between the boundary's unlocked pre-read and the engine's locked re-check).
	/// </summary>
	public sealed record NoOp : BoundaryResult;

	/// <summary>The enqueue landed: one queue row plus one ledger row committed.</summary>
	public sealed record Enqueued(
		Guid JobId,
		DateTime ScheduledFireAt,
		Guid ScheduleEpoch
	) : BoundaryResult;
}
