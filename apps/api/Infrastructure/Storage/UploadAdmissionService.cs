using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

using Npgsql;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Uploads.Entities;

namespace PublyApp.Api.Infrastructure.Storage;

public interface IUploadAdmissionService {
	/// <summary>
	/// Opens the admission transaction, atomically reserves <paramref name="bytes"/>
	/// against the durable global and per-creator budgets, and creates the asset row
	/// in <see cref="UploadAssetState.Reserved"/> — all BEFORE the caller opens the
	/// destination file. Dispose without committing rolls the whole reservation back.
	/// </summary>
	Task<UploadAdmissionScope> BeginReservationAsync(
		Guid staffUserId,
		long bytes,
		string purpose,
		CancellationToken cancellationToken = default
	);
}

public abstract record UploadAdmissionResult {
	private UploadAdmissionResult() { }

	public sealed record Accepted(UploadAsset Asset)
		: UploadAdmissionResult;

	/// <summary>
	/// Admission refused because a budget lacks headroom. Carries which scope was
	/// exhausted and the numbers needed for a transparent RFC 7807 cause (owner
	/// product rule: never a generic "something went wrong").
	/// </summary>
	public sealed record Rejected(
		UploadBudgetScope ExhaustedScope,
		long UsedBytes,
		long RequestedBytes,
		long MaxBytes
	) : UploadAdmissionResult {
		public long AvailableBytes {
			get { return MaxBytes - UsedBytes; }
		}
	}
}

/// <summary>
/// One in-flight upload's hold on the durable budgets. The scope OWNS the database
/// transaction that reserved the bytes: the commit path finishes that transaction,
/// so Postgres keeps the budget rows locked until the reservation resolves and no
/// concurrent admission can slip past the numbers this request acted on.
/// Disposing without committing rolls everything back.
/// </summary>
public sealed class UploadAdmissionScope : IAsyncDisposable {
	private readonly AppDbContext _dbContext;
	private readonly UploadAdmissionService _owner;

	internal bool CommitPending;

	internal UploadAdmissionScope(
		UploadAdmissionService owner,
		AppDbContext dbContext,
		IDbContextTransaction transaction,
		UploadAdmissionResult admission
	) {
		_owner = owner;
		_dbContext = dbContext;
		Transaction = transaction;
		Admission = admission;
	}

	public IDbContextTransaction Transaction { get; }

	public UploadAdmissionResult Admission { get; }

	// The handler calls this once the blob is durably written and audited, BEFORE
	// CommitAsync: it stamps the intent so FailAsync keeps the bytes accounted for
	// when cleanup could not be confirmed (a blob may exist → Stored orphan).
	internal void MarkCommitPending() {
		CommitPending = true;
	}

	/// <summary>
	/// Reserved → Stored: flips the asset state, moves the bytes from reserved to
	/// committed on every applicable budget row, and commits the transaction. The
	/// blob exists durably at this point, so its bytes stay accounted for even
	/// though nothing references the asset yet.
	/// </summary>
	public async Task CommitAsync(CancellationToken cancellationToken = default) {
		if (Admission is not UploadAdmissionResult.Accepted accepted) {
			throw new InvalidOperationException(
				"Cannot commit an upload whose admission was rejected."
			);
		}
		if (!CommitPending || string.IsNullOrEmpty(accepted.Asset.RelativePath)) {
			throw new InvalidOperationException(
				"Cannot commit an upload before its blob write and path stamping."
			);
		}

		try {
			accepted.Asset.State = UploadAssetState.Stored;
			await _dbContext.SaveChangesAsync(cancellationToken);
			var bytes = accepted.Asset.SizeBytes;
			await _owner.MoveReservedToCommittedAsync(
				UploadBudgetScope.Global, null, bytes, cancellationToken
			);
			await _owner.MoveReservedToCommittedAsync(
				UploadBudgetScope.CreatorUser, accepted.Asset.CreatedByUserId, bytes, cancellationToken
			);

			await Transaction.CommitAsync(cancellationToken);
		} catch {
			// A commit failure may leave the blob on disk with an unknown fate; keep
			// the bytes accounted for as a Stored orphan rather than releasing them.
			await FailAsync(releaseBudget: false, CancellationToken.None);
			throw;
		}
	}

	/// <summary>
	/// Failure path. <paramref name="releaseBudget"/> true (blob cleanup confirmed):
	/// roll back — the reservation vanishes and the bytes return to both budgets.
	/// False (a blob MAY still exist): flip the asset to Stored, MOVE reserved to
	/// committed, and commit — the bytes stay durably accounted for as an orphan
	/// rather than admitting storage this deployment cannot bound. Column invariant:
	/// a Reserved row's bytes live in reserved_bytes, a Stored row's in
	/// committed_bytes, whatever path led there. Safe to call
	/// more than once or after a dead transaction: rollback failures are swallowed.
	/// </summary>
	public async Task FailAsync(bool releaseBudget, CancellationToken cancellationToken = default) {
		if (releaseBudget || !CommitPending) {
			await RollbackQuietlyAsync();
			return;
		}

		try {
			if (Admission is not UploadAdmissionResult.Accepted accepted
				|| string.IsNullOrEmpty(accepted.Asset.RelativePath)) {
				await RollbackQuietlyAsync();
				return;
			}
			// The failure that led here may have left half-applied entity
			// mutations in the change tracker (e.g. an audit failure after the
			// handler stamped ContentType/RelativePath). Flush those unrelated
			// mutations, reattach the asset, and force a FULL update: the row
			// was originally inserted (inside this very transaction) with an
			// empty path, so the handler-stamped values must be written
			// explicitly rather than diffed against the post-Clear snapshot.
			var retainedBytes = accepted.Asset.SizeBytes;
			_dbContext.ChangeTracker.Clear();
			var assetEntry = _dbContext.UploadAsset.Attach(accepted.Asset);
			assetEntry.State = EntityState.Modified;
			accepted.Asset.State = UploadAssetState.Stored;
			await _owner.MoveReservedToCommittedAsync(
				UploadBudgetScope.Global, null, retainedBytes, cancellationToken
			);
			await _owner.MoveReservedToCommittedAsync(
				UploadBudgetScope.CreatorUser, accepted.Asset.CreatedByUserId,
				retainedBytes,
				cancellationToken
			);
			await _dbContext.SaveChangesAsync(cancellationToken);
			await Transaction.CommitAsync(cancellationToken);
		} catch {
			await RollbackQuietlyAsync();
		}
	}

	private async Task RollbackQuietlyAsync() {
		try {
			await Transaction.RollbackAsync();
		} catch {
			// Already committed/rolled back or connection gone — nothing to do.
		}
	}

	public async ValueTask DisposeAsync() {
		try {
			if (Transaction is IDbContextTransaction owned) {
				await owned.RollbackAsync();
			}
		} catch {
			// Already committed/rolled back or connection gone — nothing to do.
		}
	}
}

/// <summary>
/// Durable upload byte admission accounting (#807 F1). Replaces phase 1's
/// process-local counter: budgets live in <c>upload_budgets</c>, reservations as
/// Reserved rows in <c>upload_assets</c>, and each admission opens ONE serialisable
/// database transaction whose conditional UPDATEs against the budget rows add bytes
/// only when headroom exists AT EXECUTION TIME on the locked tuple. Concurrent
/// admissions therefore serialise on the budget rows themselves — over-admission
/// is impossible by construction because there is no read-check-write window left
/// to race (the two-context spec proves it against real Postgres).
///
/// The global budget is always enforced. A creator budget row additionally caps
/// one staff user when present (seeded from UPLOAD_PER_STAFF_MAX_BYTES).
///
/// Fail-closed: a missing or unreadable budget row rejects admission instead of
/// admitting unbounded bytes.
/// </summary>
public sealed class UploadAdmissionService(AppDbContext dbContext) : IUploadAdmissionService {
	// Purpose bucket recorded on assets admitted through the generic staff
	// endpoint; snake_case wire value per the API contract naming split.
	public const string StaffUploadPurpose = "staff_upload";

	// Serializable-retry tuning. Attempts are generous because bursts of
	// concurrent admissions serialise on the same budget tuple; the randomised
	// exponential backoff stops the losers from retrying in lockstep.
	// RetryMaxAttempts must cover the burst size of the widest in-suite race
	// spec (16 concurrent admissions, UploadAdmissionServiceSpec): a slower
	// runner stretches each attempt's commit window, so 8 attempts exhausted
	// there (#1467 run 32936347299). 12 attempts with an ~800 ms backoff
	// ceiling keep every loser alive until a winner finishes committing.
	private const int RetryMaxAttempts = 12;
	private const int RetryBackoffBaseMs = 10;
	private const int RetryBackoffMaxShift = 6;
	private const int RetryBackoffJitterMs = 40;
	private const int RetryBackoffCeilingMs = 800;

	internal AppDbContext DbContext {
		get { return dbContext; }
	}

	public async Task<UploadAdmissionScope> BeginReservationAsync(
		Guid staffUserId,
		long bytes,
		string purpose,
		CancellationToken cancellationToken = default
	) {
		if (bytes <= 0) {
			throw new ArgumentOutOfRangeException(
				nameof(bytes),
				bytes,
				"Upload bytes must be positive."
			);
		}

		// Serializable transactions abort with 40001 (or deadlock-abort 40P01)
		// when concurrent admissions race on the same budget tuples; the loser
		// must RETRY with fresh state, never surface the failure to the caller
		// (a serialization failure is a scheduling event, not an admission
		// verdict). EF wraps provider errors raised by SaveChangesAsync in
		// DbUpdateException, so unwrap before matching the SQLSTATE.
		const int MaxAttempts = RetryMaxAttempts;
		for (var attempt = 0; ; attempt += 1) {
			try {
				return await BeginReservationAttemptAsync(
					staffUserId, bytes, purpose, cancellationToken
				);
			} catch (Exception exception)
				when (attempt < MaxAttempts
					&& IsRetryableSerializationFailure(exception)) {
				// The database aborted the attempt: dispose its (already
				// rollback-decided) transaction to free the connection, drop
				// any half-tracked entities, and start the next attempt clean.
				if (dbContext.Database.CurrentTransaction
					is IDbContextTransaction aborted) {
					try {
						await aborted.DisposeAsync();
					} catch {
						// Connection may already be broken — nothing to do.
					}
				}
				dbContext.ChangeTracker.Clear();

				// Randomised exponential backoff: concurrent losers must not
				// retry in lockstep, or they keep serialising into the same
				// instant and can exhaust every attempt before the winner
				// finishes its commit.
				var backoffMs = Math.Min(
					(RetryBackoffBaseMs << Math.Min(attempt, RetryBackoffMaxShift))
						+ Random.Shared.Next(RetryBackoffJitterMs),
					RetryBackoffCeilingMs
				);
				await Task.Delay(backoffMs, cancellationToken);
			}
		}
	}

	private static bool IsRetryableSerializationFailure(Exception exception) {
		var postgres = exception as PostgresException;
		if (postgres is null && exception is DbUpdateException wrapped) {
			postgres = wrapped.InnerException as PostgresException;
		}
		if (postgres is null) {
			return false;
		}
		return postgres.SqlState
			is PostgresErrorCodes.SerializationFailure
				or PostgresErrorCodes.DeadlockDetected;
	}

	private async Task<UploadAdmissionScope> BeginReservationAttemptAsync(
		Guid staffUserId,
		long bytes,
		string purpose,
		CancellationToken cancellationToken
	) {
		var transaction = await dbContext.Database.BeginTransactionAsync(
			System.Data.IsolationLevel.Serializable, cancellationToken
		);

		await EnsureBudgetRowsExistAsync(staffUserId, cancellationToken);

		var globalUpdated = await TryAddReservedBytesAsync(
			UploadBudgetScope.Global, null, bytes, cancellationToken
		);
		if (globalUpdated == 0) {
			await TransactionRollbackAsync(transaction);
			return new UploadAdmissionScope(
				this, dbContext, transaction,
				await BuildRejectionAsync(
					UploadBudgetScope.Global, null, bytes, cancellationToken
				)
			);
		}

		var creatorUpdated = await TryAddReservedBytesAsync(
			UploadBudgetScope.CreatorUser, staffUserId, bytes, cancellationToken
		);
		if (creatorUpdated == 0) {
			// Give the global reservation back before reporting the creator cap.
			await SubtractReservedBytesAsync(
				UploadBudgetScope.Global, null, bytes, cancellationToken
			);
			await TransactionRollbackAsync(transaction);
			return new UploadAdmissionScope(
				this, dbContext, transaction,
				await BuildRejectionAsync(
					UploadBudgetScope.CreatorUser, staffUserId, bytes, cancellationToken
				)
			);
		}

		var asset = new UploadAsset {
			RelativePath = string.Empty,
			SizeBytes = bytes,
			ContentType = string.Empty,
			Purpose = purpose,
			State = UploadAssetState.Reserved,
			CreatedByUserId = staffUserId,
		};
		dbContext.UploadAsset.Add(asset);
		await dbContext.SaveChangesAsync(cancellationToken);

		return new UploadAdmissionScope(
			this, dbContext, transaction,
			new UploadAdmissionResult.Accepted(asset)
		);
	}

	// ── helpers ─────────────────────────────────────────────────────────────

	private static async Task TransactionRollbackAsync(IDbContextTransaction transaction) {
		try {
			await transaction.RollbackAsync();
		} catch {
			// A rollback racing disposal is harmless; the scope re-attempts quietly.
		}
	}

	// Reads the refusing scope's numbers AFTER the rollback so the problem details
	// can name the cause in plain words ("X free, less than this file's Y"). Reads
	// outside the aborted transaction see the last committed accounting.
	private async Task<UploadAdmissionResult.Rejected> BuildRejectionAsync(
		UploadBudgetScope scope,
		Guid? scopeKeyGuid,
		long requestedBytes,
		CancellationToken cancellationToken
	) {
		var key = scopeKeyGuid?.ToString();
		var hasScopeKey = scopeKeyGuid is not null;
		var budget = await (
			from b in dbContext.UploadBudget.AsNoTracking()
			where b.ScopeKind == scope
				&& (hasScopeKey ? b.ScopeKey == key : b.ScopeKey == null)
			select b
		).FirstOrDefaultAsync(cancellationToken);

		if (budget is null) {
			// Fail closed with honest "nothing known free" accounting.
			return new UploadAdmissionResult.Rejected(scope, long.MaxValue, requestedBytes, long.MaxValue);
		}

		var used = Math.Min(
			budget.ReservedBytes + budget.CommittedBytes,
			budget.MaxBytes
		);
		return new UploadAdmissionResult.Rejected(
			scope, used, requestedBytes, budget.MaxBytes
		);
	}

	private static int ScopeToInt(UploadBudgetScope scope) {
	return (int)scope;
}

private async Task EnsureBudgetRowsExistAsync(
		Guid staffUserId,
		CancellationToken cancellationToken
	) {
		var env = AppEnvironment.Instance;

		// Idempotent config seeding: ON CONFLICT DO NOTHING means two simultaneous
		// first-admissions cannot double-create rows, and operator-tuned max_bytes
		// survives (only missing rows are inserted). Budgets are config, not data.
		await dbContext.Database.ExecuteSqlAsync(
			$"""
			INSERT INTO upload_budgets (id, scope_kind, scope_key, max_bytes, reserved_bytes, committed_bytes)
			VALUES (uuidv7(), {ScopeToInt(UploadBudgetScope.Global)}, NULL, {env.UPLOAD_GLOBAL_MAX_BYTES}, 0, 0)
			ON CONFLICT (scope_kind, scope_key) DO NOTHING
			""",
			cancellationToken
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"""
			INSERT INTO upload_budgets (id, scope_kind, scope_key, max_bytes, reserved_bytes, committed_bytes)
			VALUES (uuidv7(), {ScopeToInt(UploadBudgetScope.CreatorUser)}, {staffUserId.ToString()}, {env.UPLOAD_PER_STAFF_MAX_BYTES}, 0, 0)
			ON CONFLICT (scope_kind, scope_key) DO NOTHING
			""",
			cancellationToken
		);
	}

	private async Task<int> TryAddReservedBytesAsync(
		UploadBudgetScope scope,
		Guid? scopeKeyGuid,
		long bytes,
		CancellationToken cancellationToken
	) {
		// Two branches instead of a null-typed parameter: Postgres cannot infer the
		// data type of a NULL placeholder inside an OR/IS NULL predicate (42P18),
		// and the branch is known statically here anyway.
		if (scopeKeyGuid is null) {
			return await dbContext.Database.ExecuteSqlAsync(
				$"""
				UPDATE upload_budgets
				SET reserved_bytes = reserved_bytes + {bytes}
				WHERE scope_kind = {ScopeToInt(scope)}
					AND scope_key IS NULL
					AND max_bytes - reserved_bytes - committed_bytes >= {bytes}
				""",
				cancellationToken
			);
		}

		return await dbContext.Database.ExecuteSqlAsync(
			$"""
			UPDATE upload_budgets
			SET reserved_bytes = reserved_bytes + {bytes}
			WHERE scope_kind = {ScopeToInt(scope)}
				AND scope_key = {scopeKeyGuid.ToString()}
				AND max_bytes - reserved_bytes - committed_bytes >= {bytes}
			""",
			cancellationToken
		);
	}

	private async Task SubtractReservedBytesAsync(
		UploadBudgetScope scope,
		Guid? scopeKeyGuid,
		long bytes,
		CancellationToken cancellationToken
	) {
		if (scopeKeyGuid is null) {
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				UPDATE upload_budgets
				SET reserved_bytes = reserved_bytes - {bytes}
				WHERE scope_kind = {ScopeToInt(scope)}
					AND scope_key IS NULL
				""",
				cancellationToken
			);
			return;
		}

		await dbContext.Database.ExecuteSqlAsync(
			$"""
			UPDATE upload_budgets
			SET reserved_bytes = reserved_bytes - {bytes}
			WHERE scope_kind = {ScopeToInt(scope)}
				AND scope_key = {scopeKeyGuid.ToString()}
			""",
			cancellationToken
		);
	}

	internal async Task MoveReservedToCommittedAsync(
		UploadBudgetScope scope,
		Guid? scopeKeyGuid,
		long bytes,
		CancellationToken cancellationToken
	) {
		if (scopeKeyGuid is null) {
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				UPDATE upload_budgets
				SET reserved_bytes = reserved_bytes - {bytes},
					committed_bytes = committed_bytes + {bytes}
				WHERE scope_kind = {ScopeToInt(scope)}
					AND scope_key IS NULL
				""",
				cancellationToken
			);
			return;
		}

		await dbContext.Database.ExecuteSqlAsync(
			$"""
			UPDATE upload_budgets
			SET reserved_bytes = reserved_bytes - {bytes},
				committed_bytes = committed_bytes + {bytes}
			WHERE scope_kind = {ScopeToInt(scope)}
				AND scope_key = {scopeKeyGuid.ToString()}
			""",
			cancellationToken
		);
	}
}
