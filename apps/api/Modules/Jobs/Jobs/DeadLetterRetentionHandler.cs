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
/// Untriaged missing-anomaly rows are NEVER age-eligible (#864/K-2): a row whose
/// <see cref="JobDeadLetter.JobType"/> carries the reserved
/// <see cref="JobDeadLetter.MissingJobTypePrefix"/> records an integrity anomaly —
/// prepared state that should exist does not. Deleting it at the age floor would
/// silently clear its alert with nobody having looked. Such a row becomes deletable
/// only once an operator acknowledgement is stamped on it (<c>triaged_at IS NOT NULL</c>,
/// via the #636 staff surface); until then it stays alerting forever, and every pass
/// reports how many rows it held back.
///
/// External-state exemptions (K-1, issue #863): rows classified 1 Present or
/// 6 Unclassified are NOT age-deleted — their external effects may still exist, or
/// they await operator triage through POST /staff/dead-letter/{id}/resolve-unclassified.
/// The run reports how many exempt rows sit beyond the horizon, so an ever-growing
/// exempt population can never silently starve the sweep unmanaged.
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
					AND external_state_status NOT IN (
						{(int)ExternalStateStatus.Present},
						{(int)ExternalStateStatus.Unclassified}
					)
					ORDER BY failed_at, id
					LIMIT {BatchSize}
					FOR UPDATE SKIP LOCKED
				)
				""",
				cancellationToken
			);

			totalDeleted += deleted;
		} while (deleted == BatchSize);

		// Always report the held-back classes: how many untriaged missing-anomaly rows
		// (#864) and how many external-state exempt rows (K-1/#863) the sweep is
		// deliberately keeping past the window. These counts are the durable answer to
		// "retention skipped something" — alerting reads the same predicates every sample.
		var heldUntriagedMissing = await CountUntriagedMissingRowsAsync(cancellationToken);
		var skippedExempt = await CountSkippedExemptAsync(retentionDays, cancellationToken);

		if (_logger.IsEnabled(LogLevel.Information)) {
			if (skippedExempt > 0) {
				_logger.LogInformation(
					"job-dead-letter-retention deleted {Deleted} row(s) older than {Days} day(s), "
					+ "held back {Held} untriaged missing-anomaly row(s); "
					+ "skipped {SkippedCount} exempt row(s) "
					+ "(external_state Present/Unclassified) beyond the horizon",
					totalDeleted,
					retentionDays,
					heldUntriagedMissing,
					skippedExempt
				);
			} else if (totalDeleted > 0 || heldUntriagedMissing > 0) {
				_logger.LogInformation(
					"job-dead-letter-retention deleted {Deleted} row(s) older than {Days} day(s), "
					+ "held back {Held} untriaged missing-anomaly row(s)",
					totalDeleted,
					retentionDays,
					heldUntriagedMissing
				);
			}
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

	/// <summary>
	/// Counts age-eligible rows the exemption predicate holds back — the starvation
	/// gauge for K-1: these need triage/sweeps (#864/#865) to ever leave the DLQ.
	/// </summary>
	private async Task<int> CountSkippedExemptAsync(
		int retentionDays,
		CancellationToken cancellationToken
	) {
		return await _dbContext.Database.SqlQuery<int>(
			$"""
			SELECT COUNT(*)::int AS "Value"
			FROM job_dead_letter
			WHERE failed_at < now() - make_interval(days => {retentionDays})
			  AND external_state_status IN (
				  {(int)ExternalStateStatus.Present},
				  {(int)ExternalStateStatus.Unclassified}
			  )
			"""
		).SingleAsync(cancellationToken);
	}
}
