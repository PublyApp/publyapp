using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Posts.Entities;

namespace PublyApp.Api.Modules.Posts.Services;

public record AttachPostMediaArgs(
	Guid TenantId,
	Guid PostId,
	string RelativePath,
	string ContentType,
	int WidthPx,
	int HeightPx,
	long SizeBytes,
	Guid UploadedByUserId
);

public interface IPostMediaAssetService {
	/// <summary>
	/// The tenant-scoped ownership read every attach/remove decision goes
	/// through. Returns null when the post does not exist OR belongs to another
	/// tenant: foreign-tenant posts are invisible (404), never forbidden.
	/// </summary>
	Task<Post?> FindOwnedPostAsync(
		Guid tenantId,
		Guid postId,
		CancellationToken cancellationToken = default
	);

	/// <summary>The live asset row for a post, or null when the post has none.</summary>
	Task<PostMediaAsset?> FindByPostAsync(
		Guid tenantId,
		Guid postId,
		CancellationToken cancellationToken = default
	);

	/// <summary>
	/// Persists the new asset row, hard-deleting any replaced live rows in the
	/// SAME unit of work. Reference coordination (#807 F5) belongs to the
	/// CALLING handler: acquire the incoming blob's reference BEFORE calling
	/// this method, and release the returned replaced path AFTER it commits.
	/// Returns the replaced image's relative path (null when the post had no
	/// live image). Physical deletion stays exclusively the sweeper's.
	/// </summary>
	Task<string?> AttachAsync(
		AttachPostMediaArgs args,
		CancellationToken cancellationToken = default
	);

	/// <summary>
	/// Removes a post's image: hard-deletes the asset row and commits. Returns
	/// the removed asset's relative path for the CALLING handler to release the
	/// blob reference after this commit (#807 F5), or null when no live asset
	/// exists for the post.
	/// </summary>
	Task<string?> RemoveAsync(
		Guid tenantId,
		Guid postId,
		CancellationToken cancellationToken = default
	);

	/// <summary>
	/// Post-deletion cascade, phase 1: stages a hard delete of every live asset
	/// row for the post in the caller's unit of work WITHOUT saving, and returns
	/// the blob paths whose references must be released after the commit. Called
	/// by DeletePostForTenant BEFORE deleting the post so the purge commits
	/// atomically with the post deletion.
	/// </summary>
	Task<IReadOnlyList<string>> StagePurgeOnPostDeleteAsync(
		Guid tenantId,
		Guid postId,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public sealed class PostMediaAssetService(
	AppDbContext dbContext
) : IPostMediaAssetService {
	public async Task<Post?> FindOwnedPostAsync(
		Guid tenantId,
		Guid postId,
		CancellationToken cancellationToken = default
	) {
		var query =
			from p in dbContext.Post.AsNoTracking()
			where p.Id == postId
				&& p.TenantId == tenantId
				&& !p.IsDeleted
			select p;
		return await query.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<PostMediaAsset?> FindByPostAsync(
		Guid tenantId,
		Guid postId,
		CancellationToken cancellationToken = default
	) {
		var query =
			from a in dbContext.PostMediaAsset.AsNoTracking()
			where a.TenantId == tenantId
				&& a.PostId == postId
				&& !a.IsDeleted
			select a;
		return await query.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<string?> AttachAsync(
		AttachPostMediaArgs args,
		CancellationToken cancellationToken = default
	) {
		// A post owns at most ONE live image (partial unique index): replacing
		// means hard-deleting the stale live row(s) in THIS unit of work —
		// otherwise the insert violates ix_post_media_assets_live_post_id.
		var replacedAssets = await (
			from a in dbContext.PostMediaAsset
			where a.TenantId == args.TenantId
				&& a.PostId == args.PostId
				&& !a.IsDeleted
			select a
		).ToListAsync(cancellationToken);
		var replacedPath = replacedAssets.Count > 0
			? replacedAssets[0].RelativePath
			: null;

		// NOTE (#807 F5, #1461): the CALLING handler acquires the new blob's
		// reference BEFORE calling this method, so the URL can never commit
		// while its asset still reads zero references.

		var asset = new PostMediaAsset {
			TenantId = args.TenantId,
			PostId = args.PostId,
			RelativePath = args.RelativePath,
			ContentType = args.ContentType,
			AltText = null,
			WidthPx = args.WidthPx,
			HeightPx = args.HeightPx,
			SizeBytes = args.SizeBytes,
			UploadedByUserId = args.UploadedByUserId,
		};
		await dbContext.PostMediaAsset.AddAsync(asset, cancellationToken);

		foreach (var replaced in replacedAssets) {
			dbContext.ForceHardDelete(replaced);
		}

		// One commit: the insert and the replacement's purge land atomically
		// (EF Core issues same-table deletes before inserts in the batch).
		await dbContext.SaveChangesAsync(cancellationToken);

		// Release of the replaced image's reference AFTER this commit (#807 F5)
		// belongs to the calling handler via the returned path; physical
		// deletion stays exclusively sweeper's.
		return replacedPath;
	}

	public async Task<string?> RemoveAsync(
		Guid tenantId,
		Guid postId,
		CancellationToken cancellationToken = default
	) {
		var asset = await (
			from a in dbContext.PostMediaAsset
			where a.TenantId == tenantId
				&& a.PostId == postId
				&& !a.IsDeleted
			select a
		).FirstOrDefaultAsync(cancellationToken);
		if (asset is null) {
			return null;
		}

		var releasedPath = asset.RelativePath;
		dbContext.ForceHardDelete(asset);
		await dbContext.SaveChangesAsync(cancellationToken);

		// Reference release AFTER this commit (#807 F5) belongs to the calling
		// handler via the returned path.
		return releasedPath;
	}

	public async Task<IReadOnlyList<string>> StagePurgeOnPostDeleteAsync(
		Guid tenantId,
		Guid postId,
		CancellationToken cancellationToken = default
	) {
		// Tracked query on purpose: the entities must sit in the change tracker
		// as Deleted when the caller saves its own unit of work.
		var assets = await (
			from a in dbContext.PostMediaAsset
			where a.TenantId == tenantId
				&& a.PostId == postId
				&& !a.IsDeleted
			select a
		).ToListAsync(cancellationToken);
		if (assets.Count == 0) {
			return [];
		}

		dbContext.ForceHardDeleteRange(assets);
		// No SaveChanges here on purpose: the caller (DeletePostForTenant)
		// commits this together with the post deletion in one transaction.
		return assets.Select(a => a.RelativePath).ToList();
	}
}
