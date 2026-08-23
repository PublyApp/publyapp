using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Uploads.Entities;

namespace PublyApp.Api.Modules.Uploads.Services;

/// <summary>
/// Atomic reference-count transitions over <see cref="UploadAsset"/> rows (#807 F5).
///
/// Every persistence of a served <c>/files/...</c> URL (tenant logo, account or
/// staff avatar) acquires one reference BEFORE its entity write commits; every
/// replacement or clear releases the previous URL's reference in the SAME
/// transaction as the entity write. Physical deletion never happens here: the
/// sweeper job is the only deleter, and it re-checks
/// <see cref="UploadAsset.ReferenceCount"/> == 0 inside the row lock at delete
/// time. That closes the TOCTOU window the old inline
/// <c>AnyAsync(...)-then-DeleteAsync</c> cleanup left open: an acquire that
/// commits after a release's predicate ran must wait on the row lock, so "zero
/// references" observed by the releaser can never hide an in-flight re-reference.
///
/// Both operations are single conditional UPDATE statements executed against the
/// CALLER'S <see cref="AppDbContext"/>, so they join the caller's ambient
/// transaction when one exists and commit atomically with the entity write.
/// A missing asset row is NOT an error: URLs persisted before this table existed
/// (and absolute http(s) URLs, which never reach this service) legitimately have
/// no asset row; the transition reports <c>false</c> and the caller proceeds.
/// </summary>
public interface IUploadAssetReferenceService {
	/// <summary>
	/// Acquires one reference on the live asset owning <paramref name="relativePath"/>.
	/// Returns false when no live Stored/Referenced asset owns the path (legacy or
	/// unknown blob) — callers must treat that as best-effort accounting, never as
	/// a request failure.
	/// </summary>
	Task<bool> TryAddReferenceAsync(
		string relativePath,
		CancellationToken cancellationToken = default
	);

	/// <summary>
	/// Releases one reference on the asset owning <paramref name="relativePath"/>.
	/// When the count reaches zero the asset transitions to
	/// <see cref="UploadAssetState.Orphaned"/> with <c>delete_not_before</c> set to
	/// now + the configured grace period; the sweeper may physically delete the blob
	/// only after that instant AND a final zero-reference recheck. Returns false when
	/// no live referenced/stored asset owns the path.
	/// </summary>
	Task<bool> TryReleaseReferenceAsync(
		string relativePath,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public sealed class UploadAssetReferenceService(AppDbContext dbContext)
	: IUploadAssetReferenceService {
	public async Task<bool> TryAddReferenceAsync(
		string relativePath,
		CancellationToken cancellationToken = default
	) {
		// Single-statement acquire: the state predicate is part of the UPDATE's
		// WHERE clause, so the check and the increment are one atomic step on the
		// locked tuple — no read-check-write window to race. Concurrent
		// acquire/release/sweeper attempts serialise on this row.
		var updated = await dbContext.Database.ExecuteSqlAsync(
			$"""
			UPDATE upload_assets
			SET reference_count = reference_count + 1,
				state = {StateToInt(UploadAssetState.Referenced)},
				delete_not_before = NULL,
				updated_at = NOW()
			WHERE relative_path = {relativePath}
				AND is_deleted = false
				AND state IN ({StateToInt(UploadAssetState.Stored)}, {StateToInt(UploadAssetState.Referenced)})
			""",
			cancellationToken
		);
		return updated == 1;
	}

	public async Task<bool> TryReleaseReferenceAsync(
		string relativePath,
		CancellationToken cancellationToken = default
	) {
		var gracePeriodDays = AppEnvironment.Instance.UPLOAD_ORPHAN_GRACE_DAYS;
		var updated = await dbContext.Database.ExecuteSqlAsync(
			$"""
			UPDATE upload_assets
			SET reference_count = reference_count - 1,
				state = CASE WHEN reference_count - 1 <= 0
					THEN {StateToInt(UploadAssetState.Orphaned)}
					ELSE {StateToInt(UploadAssetState.Referenced)} END,
				delete_not_before = CASE WHEN reference_count - 1 <= 0
					THEN NOW() + make_interval(days => {gracePeriodDays})
					ELSE delete_not_before END,
				updated_at = NOW()
			WHERE relative_path = {relativePath}
				AND is_deleted = false
				AND state = {StateToInt(UploadAssetState.Referenced)}
				AND reference_count > 0
			""",
			cancellationToken
		);
		return updated == 1;
	}

	private static int StateToInt(UploadAssetState state) {
		return (int)state;
	}
}
