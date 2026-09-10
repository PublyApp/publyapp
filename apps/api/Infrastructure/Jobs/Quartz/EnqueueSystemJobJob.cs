using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Jobs.Entities;

using Quartz;

namespace PublyApp.Api.Infrastructure.Jobs.Quartz;

/// <summary>
/// The generic action fired by every dynamic <c>system_job_definitions</c> cron trigger
/// (wired by <see cref="SyncSystemJobsJob"/>). It fences retired schedule epochs, claims
/// the scheduled instant in <c>system_job_occurrences</c>, and conditionally enqueues a
/// <see cref="JobQueueItem"/> with <c>job_type = job_key</c>. The trigger only enqueues —
/// the leader never executes domain work itself (design §5.2/§5.3).
/// </summary>
public sealed class EnqueueSystemJobJob : IJob {
	// JobDataMap key carrying the system-job definition's stable job_key.
	public const string JobKeyDataKey = "jobKey";
	public const string ScheduleEpochDataKey = "scheduleEpoch";

	private readonly AppDbContext _DbContext;
	private readonly ILogger<EnqueueSystemJobJob> _Logger;

	public EnqueueSystemJobJob(AppDbContext dbContext, ILogger<EnqueueSystemJobJob> logger) {
		_DbContext = dbContext;
		_Logger = logger;
	}

	public async Task Execute(IJobExecutionContext context) {
		var jobKey = context.MergedJobDataMap.GetString(JobKeyDataKey);
		if (string.IsNullOrWhiteSpace(jobKey)) {
			_Logger.LogWarning(
				"EnqueueSystemJobJob fired without a '{DataKey}' in its JobDataMap; skipping",
				JobKeyDataKey
			);
			return;
		}

		var scheduledFireTime = context.ScheduledFireTimeUtc;
		if (scheduledFireTime is null) {
			_Logger.LogWarning(
				"EnqueueSystemJobJob fired without ScheduledFireTimeUtc for {JobKey}; skipping",
				jobKey
			);
			return;
		}

		var scheduleEpochText = context.MergedJobDataMap.GetString(ScheduleEpochDataKey);
		if (!Guid.TryParse(scheduleEpochText, out var scheduleEpoch)) {
			_Logger.LogWarning(
				"EnqueueSystemJobJob fired without a valid '{DataKey}' for {JobKey}; skipping",
				ScheduleEpochDataKey,
				jobKey
			);
			return;
		}

		await EnqueueOccurrenceAsync(
			jobKey,
			scheduledFireTime.Value.UtcDateTime,
			scheduleEpoch,
			context.CancellationToken
		);
	}

	// Public deterministic seam: specs drive the transaction without faking Quartz's
	// IJobExecutionContext. scheduledFireAt is always the trigger's scheduled UTC instant.
	public async Task EnqueueOccurrenceAsync(
		string jobKey,
		DateTime scheduledFireAt,
		Guid scheduleEpoch,
		CancellationToken cancellationToken
	) {
		await using var transaction = await _DbContext.Database.BeginTransactionAsync(
			cancellationToken
		);

		// Lock the current definition so a schedule-epoch rotation cannot interleave with
		// validation and enqueue. A stale or missing definition is a rejected no-op.
		var currentScheduleEpochs = await _DbContext.Database.SqlQuery<Guid>(
			$"""
			SELECT schedule_epoch AS "Value"
			FROM system_job_definitions
			WHERE job_key = {jobKey} AND is_deleted = false AND is_enabled = true
			FOR UPDATE
			"""
		).ToListAsync(cancellationToken);

		if (currentScheduleEpochs.Count != 1 || currentScheduleEpochs[0] != scheduleEpoch) {
			_Logger.LogWarning(
				"system_job.fire_rejected job_key={JobKey} schedule_epoch={ScheduleEpoch}",
				jobKey,
				scheduleEpoch
			);
			await transaction.CommitAsync(cancellationToken);
			return;
		}

		var inserted = await _DbContext.Database.ExecuteSqlAsync(
			$"""
			INSERT INTO system_job_occurrences (job_key, scheduled_fire_at)
			VALUES ({jobKey}, {scheduledFireAt})
			ON CONFLICT (job_key, scheduled_fire_at) DO NOTHING
			""",
			cancellationToken
		);

		if (inserted == 0) {
			await transaction.CommitAsync(cancellationToken);
			return;
		}

		// Engine-internal construction remains the ratified minimal queue-write seam.
		// Database defaults stamp all queue timestamps; the explicit transaction makes
		// the ledger row, queue row, informational link, and definition stamp atomic.
		var enqueued = new JobQueueItem { JobType = jobKey };
		await _DbContext.JobQueue.AddAsync(enqueued, cancellationToken);
		await _DbContext.SaveChangesAsync(cancellationToken);

		if (enqueued.Id is null) {
			throw new InvalidOperationException("The system-job queue insert returned no id.");
		}

		await _DbContext.Database.ExecuteSqlAsync(
			$"""
			UPDATE system_job_occurrences
			SET enqueued_job_id = {enqueued.Id.Value}
			WHERE job_key = {jobKey} AND scheduled_fire_at = {scheduledFireAt}
			""",
			cancellationToken
		);
		await _DbContext.Database.ExecuteSqlAsync(
			$"""
			UPDATE system_job_definitions
			SET last_enqueued_at = now()
			WHERE job_key = {jobKey} AND is_deleted = false
			""",
			cancellationToken
		);

		await transaction.CommitAsync(cancellationToken);

		if (_Logger.IsEnabled(LogLevel.Information)) {
			_Logger.LogInformation("Enqueued system job {JobKey} into job_queue", jobKey);
		}
	}
}
