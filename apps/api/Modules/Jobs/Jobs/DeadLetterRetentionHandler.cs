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
/// Untriaged missing-anomaly rows are NEVER eligible (#864/K-2): a row whose
/// <see cref="JobDeadLetter.JobType"/> carries the reserved
/// <see cref="JobDeadLetter.MissingJobTypePrefix"/> records an integrity anomaly —
/// prepared state that should exist does not. Deleting it at the age floor would
/// silently clear its alert with nobody having looked. Such a row becomes deletable
/// only once an operator acknowledgement is stamped on it (<c>triaged_at IS NOT NULL</c>,
/// via the #636 staff surface); until then it stays alerting forever, and every pass
/// reports how many rows it held back.
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

			// #864/K-2 exemption lives IN the delete predicate: an untriaged row carrying the
			// reserved missing-anomaly job_type prefix is invisible to the age sweep, however
			// old it is. Triaged missing rows (triaged_at IS NOT NULL) delete like any other;
			// so does everything whose job_type is not a missing-anomaly marker at all.
			deleted = await _dbContext.Database.ExecuteSqlAsync(
				$"""
				DELETE FROM job_dead_letter
				WHERE id IN (
					SELECT id FROM job_dead_letter
					WHERE failed_at < now() - make_interval(days => {retentionDays})
						AND (triaged_at IS NOT NULL
							OR job_type NOT LIKE {JobDeadLetter.MissingJobTypeLikePattern})
					ORDER BY failed_at, id
					LIMIT {BatchSize}
					FOR UPDATE SKIP LOCKED
				)
				""",
				cancellationToken
			);

			totalDeleted += deleted;
		} while (deleted == BatchSize);

		// Always report the held-back class (#864): how many missing-anomaly rows the sweep
		// is deliberately keeping past the window because nobody has triaged them yet. This
		// count is the durable answer to "retention skipped something" — the alerting side
		// reads the same predicate every sample (jobs.dlq.untriaged_missing).
		var heldUntriagedMissing = await CountUntriagedMissingRowsAsync(cancellationToken);
		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"job-dead-letter-retention deleted {Deleted} row(s) older than {Days} day(s), "
				+ "held back {Held} untriaged missing-anomaly row(s)",
				totalDeleted,
				retentionDays,
				heldUntriagedMissing
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
