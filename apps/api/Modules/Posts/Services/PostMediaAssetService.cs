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
	/// live row(s) a replacement purges, inserts the new row, and saves. Returns
	/// the blob paths it DISPLACED (inside this same transaction, the moment the
	/// replacement's row is hard-deleted) so the CALLING HANDLER can release those
	/// asset references AFTER this method's commit. The handler MUST acquire the
	/// NEW blob's reference before calling (so the URL can never commit at zero
	/// references) and release the RETURNED displaced paths after. Capturing the
	/// replaced path in the handler before this call races the purge and leaks the
	/// predecessor's blob reference (#1617) — that responsibility lives here, not
	/// in the handler. Physical deletion stays exclusively the sweeper's.	/// </summary>
	Task<IReadOnlyList<string>> AttachAsync(
		AttachPostMediaArgs args,
		CancellationToken cancellationToken = default
	);

	/// Removes a post's image: hard-deletes the asset row in its own unit of
	/// work (one unit of work). Returns null when no live asset exists for the
	/// post; otherwise returns the removed blob's relative path so the CALLING
	/// HANDLER can release its asset reference AFTER the commit (#807 F5;
	/// #1461 moved the release out of the service). Physical deletion stays
	/// exclusively the sweeper's.
	/// </summary>
	Task<string?> RemoveAsync(
		Guid tenantId,
		Guid postId,
		CancellationToken cancellationToken = default
	);

	/// <summary>
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

	public async Task<IReadOnlyList<string>> AttachAsync(
		AttachPostMediaArgs args,
		CancellationToken cancellationToken = default
	) {
		// A post owns at most ONE live image (partial unique index): replacing
		// means hard-deleting the stale live row(s) in THIS unit of work —
		// otherwise the insert violates ux_post_media_assets_live_post_id.
		// The replaced paths are read from the SAME query that feeds the purge, so
		// the capture and the hard-delete are one atomic step: a concurrent
		// attach that commits first changes the rows this SELECT sees, and the
		// returned paths always reflect exactly what THIS commit removed — no
		// blob reference can be left acquired-and-unreleased under contention
		// (#1616).
		var replacedAssets = await (
			from a in dbContext.PostMediaAsset
			where a.TenantId == args.TenantId
				&& a.PostId == args.PostId
				&& !a.IsDeleted
			select a
		).ToListAsync(cancellationToken);
		var replacedPaths = replacedAssets
			.Select(static a => a.RelativePath)
			.ToList();

		// Capture the displaced blob paths NOW, inside this tracked query's scope,
		// so the handler releases exactly the rows this commit is about to purge.
		// Doing this in the handler before the call races concurrent purges and
		// leaks the predecessor's reference (#1617).
		var displacedPaths = replacedAssets
			.Select(a => a.RelativePath)
			.ToList();

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

		// The CALLING HANDLER acquired the new blob's reference before this call
		// and now releases the displaced paths returned here after the commit
		// (#807 F5); physical deletion stays exclusively sweeper's.
		return displacedPaths;
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

		dbContext.ForceHardDelete(asset);
		await dbContext.SaveChangesAsync(cancellationToken);
		// The CALLING handler releases this reference after the commit above
		// (#807 F5 / #1461).
		return asset.RelativePath;
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
