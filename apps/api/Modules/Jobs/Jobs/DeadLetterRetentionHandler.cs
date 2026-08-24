using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Jobs.Entities;

namespace PublyApp.Api.Modules.Jobs.Jobs;

/// <summary>
/// Retention sweep system job (design §7.3, Phase 3) for <c>job_dead_letter</c>:
/// hard-deletes terminal-failure rows older than <c>JOB_DEAD_LETTER_RETENTION_DAYS</c>
/// (default 90; O7) in bounded batches. DLQ payloads may reference tenant data (F20), so
/// this is both a privacy and a storage control; the window is env-overridable policy.
///
/// Idempotency (F13): the horizon predicate <c>failed_at &lt; now() - interval</c> is
/// evaluated in SQL against database time (F11); a re-run deletes fewer rows and is
/// harmless. A row exactly AT the horizon is kept (strict <c>&lt;</c>).
///
/// Note: swept rows are not requeuable afterwards — retention past the window is the
/// deliberate end of a dead job's life; a still-wanted job is requeued (§4.2) before it
/// ages out.
/// </summary>
public sealed class DeadLetterRetentionHandler : IJobHandler {
	public const string JobKey = "job-dead-letter-retention";

	private const int BatchSize = 500;

	private readonly AppDbContext _dbContext;
	private readonly ILogger<DeadLetterRetentionHandler> _logger;

	public DeadLetterRetentionHandler(
		AppDbContext dbContext,
		ILogger<DeadLetterRetentionHandler> logger
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
		var retentionDays = AppEnvironment.Instance.JOB_DEAD_LETTER_RETENTION_DAYS;
		var totalDeleted = 0;
		int deleted;

		do {
			cancellationToken.ThrowIfCancellationRequested();

			deleted = await _dbContext.Database.ExecuteSqlAsync(
				$"""
				DELETE FROM job_dead_letter
				WHERE id IN (
					SELECT id FROM job_dead_letter
					WHERE failed_at < now() - make_interval(days => {retentionDays})
					ORDER BY failed_at, id
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
				"job-dead-letter-retention deleted {Count} row(s) older than {Days} day(s)",
				totalDeleted,
				retentionDays
			);
		}

		return JobOutcome.Succeeded;
	}

	/// <summary>
	/// Rows currently HELD by the #864 exemption: missing-anomaly job types with no
	/// operator acknowledgement. Public seam (the repo's determinism discipline) so specs
	/// assert the skip report directly and the monitor samples the identical predicate.
	/// </summary>
	public async Task<long> CountUntriagedMissingRowsAsync(CancellationToken cancellationToken) {
		return await _dbContext.JobDeadLetter.LongCountAsync(
			d => d.TriagedAt == null && d.JobType.StartsWith(JobDeadLetter.MissingJobTypePrefix),
			cancellationToken
		);
	}
}
