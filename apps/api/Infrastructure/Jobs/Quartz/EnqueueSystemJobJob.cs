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

	private readonly AppDbContext _dbContext;
	private readonly ILogger<EnqueueSystemJobJob> _logger;

	public EnqueueSystemJobJob(AppDbContext dbContext, ILogger<EnqueueSystemJobJob> logger) {
		_dbContext = dbContext;
		_logger = logger;
	}

	public async Task Execute(IJobExecutionContext context) {
		var jobKey = context.MergedJobDataMap.GetString(JobKeyDataKey);
		if (string.IsNullOrWhiteSpace(jobKey)) {
			_logger.LogWarning(
				"EnqueueSystemJobJob fired without a '{DataKey}' in its JobDataMap; skipping",
				JobKeyDataKey
			);
			return;
		}

		var scheduledFireTime = context.ScheduledFireTimeUtc;
		if (scheduledFireTime is null) {
			_logger.LogWarning(
				"EnqueueSystemJobJob fired without ScheduledFireTimeUtc for {JobKey}; skipping",
				jobKey
			);
			return;
		}

		var scheduleEpochText = context.MergedJobDataMap.GetString(ScheduleEpochDataKey);
		if (!Guid.TryParse(scheduleEpochText, out var scheduleEpoch)) {
			_logger.LogWarning(
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
		await using var transaction = await _dbContext.Database.BeginTransactionAsync(
			cancellationToken
		);

		// Lock the current definition so a schedule-epoch rotation cannot interleave with
		// validation and enqueue. A stale or missing definition is a rejected no-op.
		var currentScheduleEpochs = await _dbContext.Database.SqlQuery<Guid>(
			$"""
			SELECT schedule_epoch AS "Value"
			FROM system_job_definitions
			WHERE job_key = {jobKey} AND is_deleted = false AND is_enabled = true
			FOR UPDATE
			"""
		).ToListAsync(cancellationToken);

		if (currentScheduleEpochs.Count != 1 || currentScheduleEpochs[0] != scheduleEpoch) {
			_logger.LogWarning(
				"system_job.fire_rejected job_key={JobKey} schedule_epoch={ScheduleEpoch}",
				jobKey,
				scheduleEpoch
			);
			await transaction.CommitAsync(cancellationToken);
			return;
		}

		var inserted = await _dbContext.Database.ExecuteSqlAsync(
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
		await _dbContext.JobQueue.AddAsync(enqueued, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken);

		if (enqueued.Id is null) {
			throw new InvalidOperationException("The system-job queue insert returned no id.");
		}

		await _dbContext.Database.ExecuteSqlAsync(
			$"""
			UPDATE system_job_occurrences
			SET enqueued_job_id = {enqueued.Id.Value}
			WHERE job_key = {jobKey} AND scheduled_fire_at = {scheduledFireAt}
			""",
			cancellationToken
		);
		await _dbContext.Database.ExecuteSqlAsync(
			$"""
			UPDATE system_job_definitions
			SET last_enqueued_at = now()
			WHERE job_key = {jobKey} AND is_deleted = false
			""",
			cancellationToken
		);

		await transaction.CommitAsync(cancellationToken);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation("Enqueued system job {JobKey} into job_queue", jobKey);
		}
	}
}
