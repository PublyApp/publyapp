using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs.Quartz;

namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// Delegates staff trigger-now (#636) to the engine's own
/// <see cref="EnqueueSystemJobJob.EnqueueOccurrenceAsync"/> — the boundary never
/// writes <c>system_job_definitions</c> and NEVER rotates the schedule epoch
/// (rotation happens only on cron_updated). Race bound (#1458 follow-up 3): the
/// boundary's <c>is_enabled</c> pre-read is deliberately UNLOCKED and only a
/// cheap early signal; the authoritative check is the engine's
/// <c>SELECT ... FOR UPDATE ... AND is_enabled = true</c>. A disable committing
/// between the two costs at most ONE extra occurrence whose composite key
/// (<c>ON CONFLICT (job_key, scheduled_fire_at) DO NOTHING</c>) keeps it
/// unrepeatable — bounded, not leaked.
/// </summary>
public sealed class EnqueueSystemJobBoundary(
	AppDbContext dbContext,
	EnqueueSystemJobJob engine
) : IEnqueueSystemJobBoundary {
	public async Task<BoundaryResult> EnqueueNowAsync(
		string jobKey,
		CancellationToken cancellationToken
	) {
		var definition = await dbContext.SystemJobDefinition
			.AsNoTracking()
			.Where(row => row.JobKey == jobKey && !row.IsDeleted)
			.Select(row => new { row.ScheduleEpoch, row.IsEnabled })
			.FirstOrDefaultAsync(cancellationToken);

		if (definition is null) {
			return new BoundaryResult.NotFound();
		}

		if (!definition.IsEnabled) {
			return new BoundaryResult.NoOp();
		}

		// Same call the Quartz cron trigger makes: ledger claim + queue insert +
		// last_enqueued_at stamp inside one engine-owned transaction. The boundary
		// must NOT hold its own transaction across this call — the engine opens
		// one on the shared scoped context itself.
		await engine.EnqueueOccurrenceAsync(
			jobKey,
			DateTime.UtcNow,
			definition.ScheduleEpoch,
			cancellationToken
		);

		// If a disable or epoch rotation committed between the pre-read and the
		// engine's locked re-check, the engine refused and no rows landed — report
		// that honestly instead of fabricating a job id.
		var occurrence = await dbContext.SystemJobOccurrence
			.AsNoTracking()
			.Where(row => row.JobKey == jobKey)
			.OrderByDescending(row => row.ScheduledFireAt)
			.FirstOrDefaultAsync(cancellationToken);

		if (occurrence is null || occurrence.EnqueuedJobId is not Guid jobId) {
			return new BoundaryResult.NoOp();
		}

		return new BoundaryResult.Enqueued(
			jobId,
			occurrence.ScheduledFireAt,
			definition.ScheduleEpoch
		);
	}
}
