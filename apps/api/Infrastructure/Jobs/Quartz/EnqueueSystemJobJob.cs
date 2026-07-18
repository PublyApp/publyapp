using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Jobs.Entities;

using Quartz;

namespace PublyApp.Api.Infrastructure.Jobs.Quartz;

/// <summary>
/// The generic action fired by every dynamic <c>system_job_definitions</c> cron trigger
/// (wired by <see cref="SyncSystemJobsJob"/>): it enqueues a <see cref="JobQueueItem"/>
/// with <c>job_type = job_key</c> so any worker's <see cref="JobQueueProcessor"/> claims
/// and runs it, and stamps the definition's <c>last_enqueued_at</c>. The trigger only
/// enqueues — the leader never executes domain work itself (design §5.2/§5.3), so leader
/// failover never strands in-flight jobs.
/// </summary>
public sealed class EnqueueSystemJobJob : IJob {
	// JobDataMap key carrying the system-job definition's stable job_key.
	public const string JobKeyDataKey = "jobKey";

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

		var cancellationToken = context.CancellationToken;

		// Engine-internal construction (legal under the Infrastructure/Jobs enqueue
		// boundary — see JobEnqueueBoundary.Spec allowlist): system jobs are keyed by a
		// DB-configured string job_key, so the typed IJobEnqueuer/JobDefinition path
		// (which requires a compile-time payload contract) cannot serve them until
		// Phase 3 lands per-job definitions. Timestamps/scheduling stay unset so the
		// database defaults stamp them at insert (F11 — DB now(), never app clocks).
		var enqueued = new JobQueueItem { JobType = jobKey };
		await _dbContext.JobQueue.AddAsync(enqueued, cancellationToken);

		var definition = await _dbContext.SystemJobDefinition
			.FirstOrDefaultAsync(d => d.JobKey == jobKey && !d.IsDeleted, cancellationToken);
		if (definition is not null) {
			definition.LastEnqueuedAt = DateTime.UtcNow;
		}

		await _dbContext.SaveChangesAsync(cancellationToken);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation("Enqueued system job {JobKey} into job_queue", jobKey);
		}
	}
}
