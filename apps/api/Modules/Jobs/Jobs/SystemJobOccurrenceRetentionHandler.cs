using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib;

namespace PublyApp.Api.Modules.Jobs.Jobs;

/// <summary>
/// Hard-deletes durable system-job occurrence identities older than the configured
/// live-fire dedup window. The bounded, skip-locked sweep is idempotent and uses
/// database time; no catch-up/reconciliation watermark is introduced here.
/// </summary>
public sealed class SystemJobOccurrenceRetentionHandler : IJobHandler {
	public const string JobKey = "system-job-occurrence-retention";

	private const int BatchSize = 500;

	private readonly AppDbContext _dbContext;
	private readonly ILogger<SystemJobOccurrenceRetentionHandler> _logger;

	public SystemJobOccurrenceRetentionHandler(
		AppDbContext dbContext,
		ILogger<SystemJobOccurrenceRetentionHandler> logger
	) {
		_dbContext = dbContext;
		_logger = logger;
	}

	public string JobType {
		get { return JobKey; }
	}

	public async Task<JobOutcome> HandleAsync(
		JobContext context,
		CancellationToken cancellationToken
	) {
		var retentionDays = AppEnvironment.Instance.SYSTEM_JOB_OCCURRENCE_RETENTION_DAYS;
		var totalDeleted = 0;
		int deleted;

		do {
			cancellationToken.ThrowIfCancellationRequested();
			deleted = await _dbContext.Database.ExecuteSqlAsync(
				$"""
				DELETE FROM system_job_occurrences
				WHERE ctid IN (
					SELECT ctid FROM system_job_occurrences
					WHERE scheduled_fire_at < now() - make_interval(days => {retentionDays})
					ORDER BY scheduled_fire_at
					LIMIT {BatchSize}
					FOR UPDATE SKIP LOCKED
				)
				""",
				cancellationToken
			);
			totalDeleted += deleted;
		} while (deleted == BatchSize);

		if (totalDeleted > 0 && _logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"system-job-occurrence-retention deleted {Count} row(s) older than {Days} day(s)",
				totalDeleted,
				retentionDays
			);
		}

		return JobOutcome.Succeeded;
	}
}
