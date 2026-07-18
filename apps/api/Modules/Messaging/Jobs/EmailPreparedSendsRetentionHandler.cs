using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib;

namespace PublyApp.Api.Modules.Messaging.Jobs;

/// <summary>
/// Retention sweep system job (design §4.5/§7.3, Phase 3) for the
/// <c>email_prepared_sends</c> send-once scratch. "Orphan" is defined by a LIVE-STATE
/// ANTI-JOIN, never age alone (C1): a scratch row may be deleted only when its
/// <c>job_id</c> exists in NEITHER <c>job_queue</c> NOR <c>job_dead_letter</c> — the job
/// is fully resolved and gone — AND the row is older than a short safety floor. A live
/// job's frozen envelope can never be swept out from under it regardless of age; the
/// anti-join is the gate, the floor is only a backstop against truly-leaked rows.
///
/// Because the stored bytes contain a live token, the floor is kept short and is
/// OPERATOR-ADJUSTABLE: it reads <c>EMAIL_PREPARED_SEND_RETENTION_DAYS</c> (design §3.1 —
/// a first-class validated var, default 7, "never a hardcoded value" per §7.3). Being a
/// correctness backstop is precisely why it must not be a code constant: when the floor
/// is the privacy window on token-bearing bytes, an operator responding to an incident
/// has to be able to shorten it without shipping a deploy. The same var sets the
/// email-DLQ requeue window, so one setting moves both ends of the contract together.
///
/// Orphans are the one class whose boundary is retroactive (K-4): a true orphan never had
/// an <c>external_state_expires_at</c> materialized, so it is swept against
/// <c>created_at</c> + the CURRENT value of the var. Rows with a recorded boundary are
/// read, never recomputed (§4.2/§4.5, R6-2) — that path is not this batch's.
///
/// Idempotency (F13): predicate evaluated in SQL against database time (F11); re-runs are
/// harmless.
/// </summary>
public sealed class EmailPreparedSendsRetentionHandler : IJobHandler {
	public const string JobKey = "email-prepared-sends-retention";

	private const int BatchSize = 500;

	private readonly AppDbContext _dbContext;
	private readonly ILogger<EmailPreparedSendsRetentionHandler> _logger;

	// Test seam (the repo's optional-constructor-arg pattern): null in production, so the
	// floor is read from AppEnvironment per run; a spec passes a non-default so it can prove
	// the handler actually FOLLOWS the configured floor rather than a hardcoded 7.
	private readonly int? _retentionDaysOverride;

	public EmailPreparedSendsRetentionHandler(
		AppDbContext dbContext,
		ILogger<EmailPreparedSendsRetentionHandler> logger,
		int? retentionDaysOverride = null
	) {
		_dbContext = dbContext;
		_logger = logger;
		_retentionDaysOverride = retentionDaysOverride;
	}

	public string JobType {
		get { return JobKey; }
	}

	public async Task<JobOutcome> HandleAsync(
		JobContext context,
		CancellationToken cancellationToken
	) {
		// Safety floor (design §3.1/§7.3): a resolved-job orphan is only swept once it is
		// at least this old, a backstop against a race where the anti-join briefly sees a
		// job gone. Read per run, so an operator's change takes effect on the next pass.
		var safetyFloorDays =
			_retentionDaysOverride ?? AppEnvironment.Instance.EMAIL_PREPARED_SEND_RETENTION_DAYS;
		var totalDeleted = 0;
		int deleted;

		// The anti-join is the gate: NOT EXISTS against both engine tables proves the job
		// is fully resolved (delete-on-success removed the queue row; it never dead-lettered
		// or its DLQ row was itself swept). The age floor is only the secondary backstop.
		do {
			cancellationToken.ThrowIfCancellationRequested();

			deleted = await _dbContext.Database.ExecuteSqlAsync(
				$"""
				DELETE FROM email_prepared_sends
				WHERE job_id IN (
					SELECT p.job_id FROM email_prepared_sends p
						WHERE p.prepared_at < now() - make_interval(days => {safetyFloorDays})
						AND NOT EXISTS (
							SELECT 1 FROM job_queue q WHERE q.id = p.job_id
						)
						AND NOT EXISTS (
							SELECT 1 FROM job_dead_letter d WHERE d.original_job_id = p.job_id
						)
						ORDER BY p.prepared_at, p.job_id
					LIMIT {BatchSize}
					FOR UPDATE OF p SKIP LOCKED
				)
				""",
				cancellationToken
			);

			totalDeleted += deleted;
		} while (deleted == BatchSize);

		if (totalDeleted > 0 && _logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"email-prepared-sends-retention deleted {Count} orphaned scratch row(s)",
				totalDeleted
			);
		}

		return JobOutcome.Succeeded;
	}
}
