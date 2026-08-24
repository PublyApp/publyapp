using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Uploads.Entities;

namespace PublyApp.Api.Modules.Uploads.Jobs;

/// <summary>
/// Recurring system job (#807 F6) that reclaims orphaned upload blobs and releases
/// their bytes from the durable budgets — the deleter the lifecycle docs promise.
/// Without it <c>committed_bytes</c> is monotonic: every replaced logo or avatar
/// permanently inflates both budget scopes, and a lowered
/// <c>UPLOAD_GLOBAL_MAX_BYTES</c>/<c>UPLOAD_PER_STAFF_MAX_BYTES</c> ceiling could
/// never recover. This handler is the ONLY path that decreases
/// <c>committed_bytes</c> (asserted by <c>UploadBudgetAccountingInvariantSpec</c>)
/// and the ONLY writer of the <see cref="UploadAssetState.Deleted"/> transition.
///
/// Two candidate classes, swept in bounded batches:
/// - **Orphaned** rows past their grace window (<c>delete_not_before</c> =
///   release time + <c>UPLOAD_ORPHAN_GRACE_DAYS</c>, stamped by the reference
///   service's release-to-zero transition): blob removed via
///   <see cref="IFileStorage"/>, then the row flipped to <see cref="UploadAssetState.Deleted"/>
///   and its bytes subtracted from global + per-creator <c>committed_bytes</c> in the
///   SAME statement, so accounting can never drift from the table. The row itself is
///   kept (soft history, freed from the live-path index) exactly like every other
///   repo entity's delete convention.
/// - **Stale Reserved** rows (<c>updated_at</c> older than
///   <c>UPLOAD_STALE_RESERVATION_TTL_MINUTES</c>): a writer whose admission
///   transaction committed but whose process died before resolving the admission
///   scope. Its bytes are still held in <c>reserved_bytes</c>; the row is hard-deleted
///   and the reservation released on both scopes in the same statement — the same
///   end state as a rollback on the failure path.
/// - **Stored orphans past the retention TTL** (<c>UPLOAD_STORED_ORPHAN_TTL_MINUTES</c>,
///   default one day): rows the admission scope's fail-soft path kept FULLY
///   ACCOUNTED because a blob MAY exist (state remains <see cref="UploadAssetState.Stored"/>,
///   zero references, no deletion horizon). Once the TTL passes, a confirmed blob
///   removal reclaims their committed bytes; a surviving blob leaves them
///   accounted with the retry backoff — the last unbounded-growth path, closed.
///
/// Safety contract:
/// - The mutating statement restates every eligibility condition INSIDE the row
///   lock — including <c>reference_count = 0</c>: the final zero-reference recheck
///   under the tuple lock that closes the release/acquire race (an acquire
///   committing between the candidate scan and the reclaim serialises behind the
///   lock, sees a non-Orphaned/non-zero row, and reclaims nothing).
/// - Every reclaim is ONE self-contained auto-commit statement: an at-least-once
///   re-run is provably harmless because a Deleted/deleted row cannot match again
///   (F13 idempotency), and each pass acts only on rows still in their eligible
///   state.
/// - A blob removal failure bumps the row's <c>updated_at</c>, pushing it out of
///   the scan window for a retry backoff, so one stuck blob can never starve the
///   candidates queued behind it — and the database never loses accounting for
///   bytes still on disk.
/// - Never logs secrets; failures carry their cause in plain words (owner
///   transparency rule).
/// </summary>
public sealed class UploadOrphanReclaimerHandler : IJobHandler {
	// Stable dispatch key == the system_job_definitions.job_key the cron trigger
	// enqueues (EnqueueSystemJobJob sets job_queue.job_type = job_key). Kept in one
	// place so the seeder and the handler can never drift.
	public const string JobKey = "upload-orphan-reclaim";

	// Rows scanned / reclaimed per statement. Bounded like every retention sweep: a
	// large backlog must never hold locks or bloat WAL in one unbounded statement.
	private const int BatchSize = 200;

	// After a failed blob removal the row's updated_at is bumped, hiding it from
	// the scan for this long — a retry backoff so a persistently stuck blob cannot
	// sit at the head of the delete_not_before ordering and starve the rest.
	private const int BlobFailureRetryBackoffMinutes = 5;

	// The candidate scan ignores rows touched more recently than this. A row only
	// ever becomes eligible after the full grace period (its updated_at predates
	// delete_not_before), so the backoff can never delay a legitimate first
	// attempt — it only spaces out retries after observed failures.
	private const int ScanMinAgeMinutes = BlobFailureRetryBackoffMinutes;

	private readonly AppDbContext _dbContext;
	private readonly IFileStorage _fileStorage;
	private readonly IAuditLogService _auditLogService;
	private readonly ILogger<UploadOrphanReclaimerHandler> _logger;

	public UploadOrphanReclaimerHandler(
		AppDbContext dbContext,
		IFileStorage fileStorage,
		IAuditLogService auditLogService,
		ILogger<UploadOrphanReclaimerHandler> logger
	) {
		_dbContext = dbContext;
		_fileStorage = fileStorage;
		_auditLogService = auditLogService;
		_logger = logger;
	}

	public string JobType {
		get { return JobKey; }
	}

	public async Task<JobOutcome> HandleAsync(
		JobContext context,
		CancellationToken cancellationToken
	) {
		var totalOrphansDeleted = 0;
		var totalStaleReservationsReleased = 0;
		int orphansDeleted;
		int staleReleased;

		// Drain until neither class fills its batch. A full scan whose candidates
		// ALL fail blob removal makes no delete progress (their updated_at bumps
		// hide them from the next scan) — stop instead of spinning.
		do {
			cancellationToken.ThrowIfCancellationRequested();
			(orphansDeleted, staleReleased) =
				await ReclaimBatchAsync(cancellationToken);
			totalOrphansDeleted += orphansDeleted;
			totalStaleReservationsReleased += staleReleased;
		} while ((orphansDeleted == BatchSize || staleReleased == BatchSize)
			&& (orphansDeleted > 0 || staleReleased > 0));

		if ((totalOrphansDeleted > 0 || totalStaleReservationsReleased > 0)
			&& _logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"upload-orphan-reclaim reclaimed {OrphanCount} orphaned asset(s) "
				+ "and released {StaleCount} stale reservation(s)",
				totalOrphansDeleted,
				totalStaleReservationsReleased
			);
		}

		return JobOutcome.Succeeded;
	}

	/// <summary>
	/// One bounded sweep over both candidate classes. Each reclaim is its own
	/// auto-commit statement whose CTE takes the row locks (SKIP LOCKED so a
	/// concurrent sweep never deadlocks) and applies row deletion + budget release
	/// atomically — the bytes follow the row, never a pre-read snapshot.
	/// </summary>
	private async Task<(int OrphansDeleted, int StaleReleased)> ReclaimBatchAsync(
		CancellationToken cancellationToken
	) {
		var staleTtlMinutes = AppEnvironment.Instance.UPLOAD_STALE_RESERVATION_TTL_MINUTES;
		var storedOrphanTtlMinutes = AppEnvironment.Instance.UPLOAD_STORED_ORPHAN_TTL_MINUTES;

		// ── Orphaned blobs past the grace window ────────────────────────────
		// The reference service's release-to-zero transition stamps
		// delete_not_before = NOW() + UPLOAD_ORPHAN_GRACE_DAYS, so "past the
		// grace window" means precisely that timestamp has passed.
		// Candidate scan WITHOUT holding locks across the blob round-trip: the
		// mutating statement below re-checks everything under the tuple lock, so
		// a racy read here can only cause a harmless skip, never a wrong delete
		// or wrong accounting.
		var candidates = await _dbContext.Database
			.SqlQuery<ReclaimCandidate>($"""
				SELECT id AS "Id",
					relative_path AS "RelativePath",
					size_bytes AS "SizeBytes",
					created_by_user_id AS "CreatedByUserId"
				FROM upload_assets
				WHERE id IN (
					SELECT id FROM upload_assets
					WHERE is_deleted = false
						AND (
							(state = {(int)UploadAssetState.Orphaned}
								AND reference_count = 0
								AND delete_not_before IS NOT NULL
								AND delete_not_before <= now()
								AND updated_at < now() - make_interval(mins => {ScanMinAgeMinutes}))
							OR (state = {(int)UploadAssetState.Stored}
								AND reference_count = 0
								AND delete_not_before IS NULL
								AND updated_at < now()
									- make_interval(mins => {storedOrphanTtlMinutes}))
						)
					ORDER BY delete_not_before, id
					LIMIT {BatchSize}
					FOR UPDATE SKIP LOCKED
				)
				""")
			.ToListAsync(cancellationToken);

		var orphansDeleted = 0;
		foreach (var candidate in candidates) {
			cancellationToken.ThrowIfCancellationRequested();

			if (!await TryRemoveBlobAsync(candidate)) {
				continue;
			}
			if (!await MarkOrphanDeletedAndReleaseCommittedBytesAsync(candidate)) {
				continue;
			}

			orphansDeleted += 1;
			await WriteAuditQuietlyAsync(candidate, cancellationToken);
		}

		// ── Stale Reserved rows past the TTL ────────────────────────────────
		// updated_at is stamped by the base mapping on every write; a Reserved row
		// untouched longer than the TTL belongs to a writer that died before
		// resolving its admission scope. Its bytes sit in reserved_bytes: delete
		// the row and give them back on both scopes in the SAME statement. A live
		// writer holding the row blocks this UPDATE until it commits/rolls back —
		// and if it commits, the row is no longer Reserved and matches nothing.
		var staleReleased = await _dbContext.Database.ExecuteSqlAsync($"""
			WITH stale AS (
				SELECT id FROM upload_assets
				WHERE is_deleted = false
					AND state = {(int)UploadAssetState.Reserved}
					AND updated_at < now() - make_interval(mins => {staleTtlMinutes})
				LIMIT {BatchSize}
				FOR UPDATE SKIP LOCKED
			), budget_release AS (
				UPDATE upload_budgets b
				SET reserved_bytes = reserved_bytes - a.size_bytes
				FROM upload_assets a
				JOIN stale s ON s.id = a.id
				WHERE (b.scope_kind = {(int)UploadBudgetScope.Global} AND b.scope_key IS NULL)
					OR (b.scope_kind = {(int)UploadBudgetScope.CreatorUser}
						AND b.scope_key = a.created_by_user_id::text)
			)
			DELETE FROM upload_assets a USING stale s
			WHERE a.id = s.id
			""", cancellationToken);

		return (orphansDeleted, staleReleased);
	}

	// Blob first: if removal fails the row survives untouched (plus a backoff
	// bump) and stays eligible for a later pass — the database never loses
	// accounting for bytes still on disk. A missing file counts as removed (the
	// blob may already be gone); DeleteAsync reports false only when the file
	// SURVIVES deletion.
	private async Task<bool> TryRemoveBlobAsync(ReclaimCandidate candidate) {
		try {
			var removed = await _fileStorage.DeleteAsync(candidate.RelativePath);
			if (removed) {
				return true;
			}
			await BackOffCandidateAsync(candidate);
			if (_logger.IsEnabled(LogLevel.Warning)) {
				_logger.LogWarning(
					"upload-orphan-reclaim postponed reclaiming one orphaned asset "
					+ "because its blob is still present after deletion was "
					+ "attempted; the row stays accounted and retries after the "
					+ "backoff window"
				);
			}
			return false;
		} catch (Exception exception) {
			await BackOffCandidateAsync(candidate);
			if (_logger.IsEnabled(LogLevel.Warning)) {
				_logger.LogWarning(
					exception,
					"upload-orphan-reclaim postponed reclaiming one orphaned asset "
					+ "because its blob could not be deleted from storage; the row "
					+ "stays accounted and retries after the backoff window"
				);
			}
			return false;
		}
	}

	private async Task BackOffCandidateAsync(ReclaimCandidate candidate) {
		try {
			await _dbContext.Database.ExecuteSqlAsync(
				$"""
				UPDATE upload_assets
				SET updated_at = NOW()
				WHERE id = {candidate.Id}
					AND is_deleted = false
					AND state IN ({(int)UploadAssetState.Orphaned}, {(int)UploadAssetState.Stored})
				""",
				CancellationToken.None
			);
		} catch {
			// Best-effort scheduling hint only; worst case the row is rescanned
			// and the blob failure is observed again next pass.
		}
	}

	// The atomic reclaim: one statement locks the row, RESTATES every eligibility
	// condition (state Orphaned, zero references, past the grace horizon — the
	// final TOCTOU recheck), subtracts the bytes from BOTH committed budgets, and
	// flips the row to Deleted. All or nothing: either the row is Deleted and
	// every budget was debited, or nothing happened. Returns true when this call
	// performed the transition.
	private async Task<bool> MarkOrphanDeletedAndReleaseCommittedBytesAsync(
		string relativePath,
		long sizeBytes
	) {
		var deleted = await _dbContext.Database.ExecuteSqlAsync($"""
			WITH target AS (
				SELECT id FROM upload_assets
				WHERE relative_path = {relativePath}
					AND is_deleted = false
					AND reference_count = 0
					AND size_bytes = {sizeBytes}
					AND (
						(state = {(int)UploadAssetState.Orphaned}
							AND delete_not_before IS NOT NULL
							AND delete_not_before <= now())
						OR (state = {(int)UploadAssetState.Stored}
							AND delete_not_before IS NULL)
					)
			), budget_release AS (
				UPDATE upload_budgets b
				SET committed_bytes = b.committed_bytes - {sizeBytes}
				FROM target t
				JOIN upload_assets a ON a.id = t.id
				WHERE (b.scope_kind = {(int)UploadBudgetScope.Global} AND b.scope_key IS NULL)
					OR (b.scope_kind = {(int)UploadBudgetScope.CreatorUser}
						AND b.scope_key = a.created_by_user_id::text)
			)
			UPDATE upload_assets a
			SET state = {(int)UploadAssetState.Deleted},
				updated_at = NOW()
			FROM target t
			WHERE a.id = t.id
			""");
		return deleted == 1;
	}

	private Task<bool> MarkOrphanDeletedAndReleaseCommittedBytesAsync(
		ReclaimCandidate candidate
	) {
		return MarkOrphanDeletedAndReleaseCommittedBytesAsync(
			candidate.RelativePath, candidate.SizeBytes
		);
	}

	// History for the operator (owner transparency rule): the blob is physically
	// gone, so the audit trail is the durable record of what was reclaimed and
	// why. Best-effort: an audit failure must never fail the sweep — the database
	// accounting above is authoritative and already committed.
	private async Task WriteAuditQuietlyAsync(
		ReclaimCandidate candidate,
		CancellationToken cancellationToken
	) {
		try {
			await _auditLogService.LogAsync(
				new CreateAuditLogArgs(
					UserId: candidate.CreatedByUserId,
					Action: AuditActions.UploadAssetDeleted,
					TargetId: null,
					Details: new {
						Path = candidate.RelativePath,
						SizeBytes = candidate.SizeBytes,
						Cause = "orphaned with zero references past the grace period; "
							+ "blob physically deleted and committed bytes released by "
							+ UploadOrphanReclaimerHandler.JobKey,
					}
				),
				cancellationToken
			);
		} catch (Exception exception) {
			if (_logger.IsEnabled(LogLevel.Warning)) {
				_logger.LogWarning(
					exception,
					"upload-orphan-reclaim could not write the audit entry for one "
					+ "reclaimed asset; the reclaim itself is already committed"
				);
			}
		}
	}

	/// <summary>Projection for the candidate scan (not an entity).</summary>
	private sealed class ReclaimCandidate {
		public Guid Id { get; set; }
		public string RelativePath { get; set; } = string.Empty;
		public long SizeBytes { get; set; }
		public Guid CreatedByUserId { get; set; }
	}
}
