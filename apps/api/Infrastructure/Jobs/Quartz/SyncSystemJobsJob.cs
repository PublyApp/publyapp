using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Jobs;
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Jobs.Seeders;

using Quartz;
using Quartz.Impl.Matchers;

namespace PublyApp.Api.Infrastructure.Jobs.Quartz;

/// <summary>
/// Reconciles the enabled, non-deleted <c>system_job_definitions</c> rows into the
/// leader's live Quartz scheduler every 60 s (design §5.3): it adds cron triggers for new
/// definitions, updates the cron for changed ones, and removes triggers whose definition
/// was disabled, deleted, or has become INVALID — a definition whose cron no longer
/// parses must lose its previously-scheduled trigger, not keep firing the old schedule
/// forever. Protected definitions (#865/K-3, #1349) are reverted to their whole
/// code-defined state BEFORE this pass, so a protected sweep can never reach that
/// removal. One bad row never stops the sync: invalid/failed definitions are logged and
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
		// K-3 guard (#865): a disabled PRIVACY-LOAD-BEARING sweep is reverted before the
		// desired-state read, so the row below reads back enabled — its trigger is
		// reconciled like any other and can never be silently dropped. The revert is
		// persisted immediately with per-attempt transparency: cause, the key to inspect,
		// and the operator's next action. A sync failure here would be worse than the
		// condition it guards, so faults are isolated to the offending row.
		await RestoreProtectedDefinitionsAsync(cancellationToken);

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

	// Reverts any non-deleted PROTECTED definition that drifted from its code-defined
	// state — #865/K-3 refused the disable, #1349 extends the revert to the WHOLE
	// definition: a disabled row is re-enabled AND an invalid or emptied cron is
	// restored — persisting each revert immediately. Per-attempt WARNING naming the
	// job, the rejected value, and the restored cadence — never a silent drop. One bad
	// row never stops the sync: a fault is logged and skipped exactly like every other
	// per-row fault below. Deliberately key-projection + ExecuteUpdate, never entity
	// instances + SaveChanges: dashboard edits land through raw UPDATE statements that
	// bypass the change tracker, so an already-tracked stale instance would make
	// SaveChanges a silent no-op here — the exact silent-drop this guard exists to
	// prevent.
	private async Task RestoreProtectedDefinitionsAsync(CancellationToken cancellationToken) {
		// Candidate projection stays translatable SQL (no Quartz parse in the query);
		// protection and cron-validity filtering happen in memory over the tiny table.
		var candidates = await (
			from definition in _dbContext.SystemJobDefinition
			where !definition.IsDeleted
			select new {
				definition.JobKey,
				definition.IsEnabled,
				definition.CronExpression,
			}
		).ToListAsync(cancellationToken);

		var driftedProtectedJobs = candidates
			.Where(candidate => SystemJobDisableProtection.IsDisableProtected(candidate.JobKey)
				&& (!candidate.IsEnabled
					|| !CronExpression.IsValidExpression(candidate.CronExpression)))
			.ToList();

		foreach (var drifted in driftedProtectedJobs) {
			var jobKey = drifted.JobKey;
			try {
				var defaults = SystemJobDefinitionSeeder.GetCodeDefinedDefaults()
					.FirstOrDefault(definition => definition.JobKey == jobKey);
				if (defaults is null) {
					continue;
				}

				var restored = await _dbContext.SystemJobDefinition
					.Where(definition => definition.JobKey == jobKey)
					.ExecuteUpdateAsync(
						setters => setters
							.SetProperty(definition => definition.IsEnabled, defaults.IsEnabled)
							.SetProperty(
								definition => definition.CronExpression,
								defaults.CronExpression
							),
						cancellationToken
					);

				if (restored > 0) {
					_logger.LogWarning(
						"jobs.alert system_job_definition_restored job_key={JobKey} — this "
							+ "sweep deletes token-bearing prepared bytes and its cadence IS "
							+ "the privacy control (K-3); the code-defined definition was "
							+ "drifted (rejected cron '{RejectedCron}', enabled="
							+ "{DriftedEnabled}) and has been reverted to cron "
							+ "'{RestoredCron}', enabled=true. If the sweep must be stopped, "
							+ "treat it as a privacy incident instead of editing the "
							+ "definition",
						jobKey,
						drifted.CronExpression,
						drifted.IsEnabled,
						defaults.CronExpression
					);
				}
			} catch (Exception ex) when (ex is not OperationCanceledException) {
				_logger.LogError(
					ex,
					"Failed to restore the code-defined definition of protected system "
						+ "job {JobKey}; continuing with the rest of the sync",
					jobKey
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
