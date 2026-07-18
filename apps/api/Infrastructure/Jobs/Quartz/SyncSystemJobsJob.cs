using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Jobs.Entities;

using Quartz;
using Quartz.Impl.Matchers;

namespace PublyApp.Api.Infrastructure.Jobs.Quartz;

/// <summary>
/// Reconciles the enabled, non-deleted <c>system_job_definitions</c> rows into the
/// leader's live Quartz scheduler every 60 s (design §5.3): it adds cron triggers for new
/// definitions, updates the cron for changed ones, and removes triggers whose definition
/// was disabled, deleted, or has become INVALID — a definition whose cron no longer
/// parses must lose its previously-scheduled trigger, not keep firing the old schedule
/// forever. One bad row never stops the sync: invalid/failed definitions are logged and
/// skipped while the rest reconcile. Each managed trigger fires
/// <see cref="EnqueueSystemJobJob"/>; the leader only enqueues. Runs ONLY on the leader
/// (scheduled by <see cref="SchedulerLeaderService"/>).
/// </summary>
public sealed class SyncSystemJobsJob : IJob {
	// Quartz group that namespaces the dynamic, dashboard-driven triggers, keeping them
	// separate from the fixed infrastructure jobs (this job + RecoverStaleJobsJob).
	public const string SystemJobsGroup = "system-jobs";

	private readonly AppDbContext _dbContext;
	private readonly ILogger<SyncSystemJobsJob> _logger;

	public SyncSystemJobsJob(AppDbContext dbContext, ILogger<SyncSystemJobsJob> logger) {
		_dbContext = dbContext;
		_logger = logger;
	}

	public async Task Execute(IJobExecutionContext context) {
		await ReconcileAsync(context.Scheduler, context.CancellationToken);
	}

	// Public: lets specs drive one reconcile pass against a real scheduler directly
	// (public-methods-for-determinism) without faking IJobExecutionContext.
	public async Task ReconcileAsync(IScheduler scheduler, CancellationToken cancellationToken) {
		var definitions = await (
			from definition in _dbContext.SystemJobDefinition
			where definition.IsEnabled && !definition.IsDeleted
			select definition
		).ToListAsync(cancellationToken);

		// Split on cron validity FIRST: an invalid definition must not count as
		// desired — its previously-scheduled trigger (from when the cron was still
		// valid) has to be removed by the sweep below, not left firing forever.
		var validDefinitions = new List<SystemJobDefinition>();
		foreach (var definition in definitions) {
			if (CronExpression.IsValidExpression(definition.CronExpression)) {
				validDefinitions.Add(definition);
			} else {
				_logger.LogWarning(
					"System job {JobKey} has an invalid cron expression '{Cron}'; removing "
					+ "any scheduled trigger and skipping it until the definition is fixed",
					definition.JobKey,
					definition.CronExpression
				);
			}
		}

		var desiredKeys = validDefinitions
			.Select(d => d.JobKey)
			.ToHashSet(StringComparer.Ordinal);

		// Remove managed jobs whose definition is gone, disabled, or now invalid.
		var existingKeys = await scheduler.GetJobKeys(
			GroupMatcher<JobKey>.GroupEquals(SystemJobsGroup),
			cancellationToken
		);
		foreach (var existing in existingKeys) {
			if (!desiredKeys.Contains(existing.Name)) {
				await scheduler.DeleteJob(existing, cancellationToken);
			}
		}

		// Add or update triggers for each valid definition. Per-item isolation: one
		// failing row (e.g. a cron Quartz's builder rejects despite passing the parse
		// check) is logged and skipped so it cannot starve the remaining definitions.
		foreach (var definition in validDefinitions) {
			try {
					await SyncOneAsync(scheduler, definition, cancellationToken);
			} catch (Exception ex) when (ex is not OperationCanceledException) {
				_logger.LogError(
					ex,
					"Failed to reconcile system job {JobKey}; continuing with the rest",
					definition.JobKey
				);
			}
		}
	}

	private async Task SyncOneAsync(
		IScheduler scheduler,
		SystemJobDefinition definition,
		CancellationToken cancellationToken
	) {
		var jobKeyName = definition.JobKey;
		var jobKey = new JobKey(jobKeyName, SystemJobsGroup);

		// A changed cron retires every trigger stamped with the previous epoch. Persist
		// the new epoch before installing its replacement so delivery can exact-match it.
		if (await scheduler.CheckExists(jobKey, cancellationToken)) {
			var triggers = await scheduler.GetTriggersOfJob(jobKey, cancellationToken);
			var cronTrigger = triggers.OfType<ICronTrigger>().SingleOrDefault();
			if (cronTrigger is null
				|| !string.Equals(
					cronTrigger.CronExpressionString,
					definition.CronExpression,
					StringComparison.Ordinal
				)) {
				definition.ScheduleEpoch = Guid.NewGuid();
				await _dbContext.SaveChangesAsync(cancellationToken);
			}

			await scheduler.DeleteJob(jobKey, cancellationToken);
		}

		var jobDetail = JobBuilder.Create<EnqueueSystemJobJob>()
			.WithIdentity(jobKey)
			.UsingJobData(EnqueueSystemJobJob.JobKeyDataKey, jobKeyName)
			.UsingJobData(
				EnqueueSystemJobJob.ScheduleEpochDataKey,
				definition.ScheduleEpoch.ToString()
			)
			.Build();

		var trigger = TriggerBuilder.Create()
			.WithIdentity(jobKeyName, SystemJobsGroup)
			.ForJob(jobKey)
			.WithCronSchedule(definition.CronExpression)
			.Build();

		await scheduler.ScheduleJob(jobDetail, trigger, cancellationToken);
	}
}
