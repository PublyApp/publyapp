using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;

namespace PublyApp.Api.Modules.Auth.Jobs;

/// <summary>
/// Recurring system job (#389) that hard-deletes expired <c>sessions</c> rows in bounded
/// batches. Issue #261 removes an expired session only when its token is presented again;
/// sessions that are never reused would otherwise linger forever. This sweep runs
/// independently of request-authentication latency (design §5.3/§6, Phase 3).
///
/// Idempotency (F13, hard contract): the delete predicate is
/// <c>expires_at &lt;= now()</c> evaluated against database time (F11) — a re-run after a
/// crash or lost lease simply finds fewer (or zero) matching rows and is provably
/// harmless. The predicate is the domain outcome marker: a deleted row can never match
/// again. Live (unexpired) sessions are never touched.
///
/// Never logs session token values (#389 / the repo's no-secret-logging invariant): only
/// aggregate counts are logged, never a row's <c>token</c>.
/// </summary>
public sealed class CleanupExpiredSessionsHandler : IJobHandler {
	// Stable dispatch key == the system_job_definitions.job_key the cron trigger enqueues
	// (EnqueueSystemJobJob sets job_queue.job_type = job_key). Kept in one place so the
	// seeder and the handler can never drift.
	public const string JobKey = "session-cleanup";

	// Rows deleted per statement. Bounded so a large backlog never runs one unbounded
	// DELETE that holds locks / bloats WAL; the loop repeats until a short batch.
	private const int BatchSize = 500;

	private readonly AppDbContext _dbContext;
	private readonly ILogger<CleanupExpiredSessionsHandler> _logger;

	public CleanupExpiredSessionsHandler(
		AppDbContext dbContext,
		ILogger<CleanupExpiredSessionsHandler> logger
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
		var totalDeleted = 0;
		int deleted;

		// Batched hard-delete (#389): each pass removes at most BatchSize expired rows,
		// selected and deleted entirely in SQL against database now() (F11). The loop
		// stops on the first short batch — nothing left to purge.
		do {
			cancellationToken.ThrowIfCancellationRequested();

			deleted = await _dbContext.Database.ExecuteSqlAsync(
				$"""
				DELETE FROM sessions
				WHERE id IN (
					SELECT id FROM sessions
					WHERE expires_at <= now()
					ORDER BY expires_at, id
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
				"session-cleanup deleted {Count} expired session row(s)",
				totalDeleted
			);
		}

		return JobOutcome.Succeeded;
	}
}
