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
	/// Persists the new asset row in ONE unit of work: hard-deletes the stale
	/// live row(s) a replacement purges, inserts the new row, and saves. The
	/// CALLING HANDLER owns the #807 F5 reference discipline around this call:
	/// acquire the new blob's reference BEFORE calling (so the URL can never
	/// commit at zero references), then release the replaced image's reference
	/// AFTER this method returns (its SaveChanges has committed). Physical
	/// deletion stays exclusively the sweeper's.
	/// </summary>
	Task AttachAsync(
		AttachPostMediaArgs args,
		CancellationToken cancellationToken = default
	);

	/// <summary>
	/// Removes a post's image: hard-deletes the asset row and saves (one unit
	/// of work). Returns null when no live asset exists for the post; otherwise
	/// returns the removed blob's relative path so the CALLING HANDLER can
	/// release its asset reference AFTER the commit (#807 F5). Physical
	/// deletion stays exclusively the sweeper's.
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
	/// atomically with the post deletion; the handler releases those references
	/// itself AFTER its own commit (#807 F5).
	/// </summary>
	Task<IReadOnlyList<string>> StagePurgeOnPostDeleteAsync(
		Guid tenantId,
		Guid postId,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public sealed class PostMediaAssetService(AppDbContext dbContext)
	: IPostMediaAssetService {
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

	public async Task AttachAsync(
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

		// The CALLING HANDLER acquired the new blob's reference before this
		// call and releases any replaced image's reference after this commit
		// (#807 F5); physical deletion stays exclusively sweeper's.
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

		// The CALLING HANDLER releases releasedPath's asset reference after
		// this commit (#807 F5); physical deletion stays exclusively sweeper's.
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
		// commits this together with the post deletion in one transaction and
		// then releases the returned references itself (#807 F5).
		return assets.Select(a => a.RelativePath).ToList();
	}
}
