using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Publishing.Providers;

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

public record RemovePostMediaArgs(
	Guid TenantId,
	Guid PostId,
	Guid? AssetId
);

public record ReorderPostMediaArgs(
	Guid TenantId,
	Guid PostId,
	IReadOnlyList<Guid> OrderedAssetIds
);

public record SetPostMediaAltTextArgs(
	Guid TenantId,
	Guid PostId,
	Guid AssetId,
	string? AltText
);

public abstract record AttachPostMediaResult {
	/// <summary>The image was appended at the end of the post's list.</summary>
	public sealed record Attached(PostMediaAsset Asset) : AttachPostMediaResult;

	/// <summary>The post already holds the maximum number of images.</summary>
	public sealed record LimitReached(int MaxImages) : AttachPostMediaResult;
}

public abstract record ReorderPostMediaResult {
	public sealed record Reordered(IReadOnlyList<PostMediaAsset> Assets)
		: ReorderPostMediaResult;

	/// <summary>The submitted ids are not exactly the post's live image ids.</summary>
	public sealed record IdsMismatch : ReorderPostMediaResult;
}

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

	/// <summary>The first live asset row of a post (position 0), or null when it has none.</summary>
	Task<PostMediaAsset?> FindByPostAsync(
		Guid tenantId,
		Guid postId,
		CancellationToken cancellationToken = default
	);

	/// <summary>The post's live asset rows in publish order.</summary>
	Task<IReadOnlyList<PostMediaAsset>> ListByPostAsync(
		Guid tenantId,
		Guid postId,
		CancellationToken cancellationToken = default
	);

	/// <summary>
	/// Appends the new asset row at the end of the post's list in ONE unit of
	/// work, refusing a fifth image (the max-images invariant lives here; the
	/// unique (post, position) index backs it under concurrency — a racing
	/// loser surfaces as a unique violation the handler turns into a 409). The
	/// handler MUST acquire the blob's reference before calling (so the URL can
	/// never commit at zero references) and release it itself if this throws.
	/// Physical deletion stays exclusively the sweeper's.
	/// </summary>
	Task<AttachPostMediaResult> AttachAsync(
		AttachPostMediaArgs args,
		CancellationToken cancellationToken = default
	);

	/// <summary>
	/// Removes one of a post's images (the first when
	/// <c>AssetId</c> is null — the legacy single-image route):
	/// hard-deletes the row and closes the position gap in its own unit of
	/// work. Returns null when no such live asset exists; otherwise returns the
	/// removed blob's relative path so the CALLING HANDLER can release its asset
	/// reference AFTER the commit (#807 F5; #1461 moved the release out of the
	/// service). Physical deletion stays exclusively the sweeper's.
	/// </summary>
	Task<string?> RemoveAsync(
		RemovePostMediaArgs args,
		CancellationToken cancellationToken = default
	);

	/// <summary>
	/// Rewrites positions to match <c>OrderedAssetIds</c>, which must
	/// be exactly the post's live image ids.
	/// </summary>
	Task<ReorderPostMediaResult> ReorderAsync(
		ReorderPostMediaArgs args,
		CancellationToken cancellationToken = default
	);

	/// <summary>Sets one image's alt text; null when the asset is not a live image of the post.</summary>
	Task<PostMediaAsset?> SetAltTextAsync(
		SetPostMediaAltTextArgs args,
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
			orderby a.Position
			select a;
		return await query.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<IReadOnlyList<PostMediaAsset>> ListByPostAsync(
		Guid tenantId,
		Guid postId,
		CancellationToken cancellationToken = default
	) {
		var query =
			from a in dbContext.PostMediaAsset.AsNoTracking()
			where a.TenantId == tenantId
				&& a.PostId == postId
				&& !a.IsDeleted
			orderby a.Position
			select a;
		return await query.ToListAsync(cancellationToken);
	}

	public async Task<AttachPostMediaResult> AttachAsync(
		AttachPostMediaArgs args,
		CancellationToken cancellationToken = default
	) {
		var livePositions = await (
			from a in dbContext.PostMediaAsset
			where a.TenantId == args.TenantId
				&& a.PostId == args.PostId
				&& !a.IsDeleted
			select a.Position
		).ToListAsync(cancellationToken);
		var liveCount = livePositions.Count;
		if (liveCount >= ProviderLimits.MaxImagesPerPost) {
			return new AttachPostMediaResult.LimitReached(ProviderLimits.MaxImagesPerPost);
		}

		// The next slot is one past the highest live position, NOT the count: a
		// concurrent remove can leave a gap (e.g. {0,1,3}) and count would then
		// point at a taken slot on every retry. The cap is the count check above.
		// Two racing appends compute the same slot; the unique (post, position)
		// index lets exactly one commit.
		var nextPosition = liveCount == 0 ? 0 : livePositions.Max() + 1;
		var asset = new PostMediaAsset {
			TenantId = args.TenantId,
			PostId = args.PostId,
			Position = nextPosition,
			RelativePath = args.RelativePath,
			ContentType = args.ContentType,
			AltText = null,
			WidthPx = args.WidthPx,
			HeightPx = args.HeightPx,
			SizeBytes = args.SizeBytes,
			UploadedByUserId = args.UploadedByUserId,
		};
		await dbContext.PostMediaAsset.AddAsync(asset, cancellationToken);
		await dbContext.SaveChangesAsync(cancellationToken);

		return new AttachPostMediaResult.Attached(asset);
	}

	public async Task<string?> RemoveAsync(
		RemovePostMediaArgs args,
		CancellationToken cancellationToken = default
	) {
		var tenantId = args.TenantId;
		var postId = args.PostId;
		var assetId = args.AssetId;
		await using var transaction = await dbContext.Database
			.BeginTransactionAsync(cancellationToken);
		var assets = await (
			from a in dbContext.PostMediaAsset
			where a.TenantId == tenantId
				&& a.PostId == postId
				&& !a.IsDeleted
			orderby a.Position
			select a
		).ToListAsync(cancellationToken);
		var target = assetId is null
			? assets.FirstOrDefault()
			: assets.FirstOrDefault(a => a.Id == assetId.Value);
		if (target is null) {
			return null;
		}

		dbContext.ForceHardDelete(target);
		await dbContext.SaveChangesAsync(cancellationToken);

		// Close the gap so positions stay contiguous: shifting each survivor down
		// one slot never collides because the vacated slot is already free and the
		// survivors move in ascending order, one row per statement.
		var survivors = assets.Where(a => a.Id != target.Id).ToList();
		for (var index = 0; index < survivors.Count; index++) {
			if (survivors[index].Position == index) {
				continue;
			}

			survivors[index].Position = index;
			survivors[index].UpdatedAt = DateTime.UtcNow;
			await dbContext.SaveChangesAsync(cancellationToken);
		}

		await transaction.CommitAsync(cancellationToken);
		// The CALLING handler releases this reference after the commit above
		// (#807 F5 / #1461).
		return target.RelativePath;
	}

	public async Task<ReorderPostMediaResult> ReorderAsync(
		ReorderPostMediaArgs args,
		CancellationToken cancellationToken = default
	) {
		var tenantId = args.TenantId;
		var postId = args.PostId;
		var orderedAssetIds = args.OrderedAssetIds;
		await using var transaction = await dbContext.Database
			.BeginTransactionAsync(cancellationToken);
		var assets = await (
			from a in dbContext.PostMediaAsset
			where a.TenantId == tenantId
				&& a.PostId == postId
				&& !a.IsDeleted
			select a
		).ToListAsync(cancellationToken);

		var wanted = orderedAssetIds.ToHashSet();
		if (wanted.Count != orderedAssetIds.Count
			|| wanted.Count != assets.Count
			|| !assets.All(a => wanted.Contains(a.GetRequiredId()))) {
			return new ReorderPostMediaResult.IdsMismatch();
		}

		// Two phases because the unique (post, position) index is checked per
		// row: park every row on a negative slot, then assign the final slots.
		for (var index = 0; index < assets.Count; index++) {
			assets[index].Position = -(index + 1);
		}
		await dbContext.SaveChangesAsync(cancellationToken);

		var ordered = new List<PostMediaAsset>(orderedAssetIds.Count);
		for (var index = 0; index < orderedAssetIds.Count; index++) {
			var asset = assets.First(a => a.Id == orderedAssetIds[index]);
			asset.Position = index;
			asset.UpdatedAt = DateTime.UtcNow;
			ordered.Add(asset);
		}
		await dbContext.SaveChangesAsync(cancellationToken);
		await transaction.CommitAsync(cancellationToken);

		return new ReorderPostMediaResult.Reordered(ordered);
	}

	public async Task<PostMediaAsset?> SetAltTextAsync(
		SetPostMediaAltTextArgs args,
		CancellationToken cancellationToken = default
	) {
		var tenantId = args.TenantId;
		var postId = args.PostId;
		var assetId = args.AssetId;
		var altText = args.AltText;
		var asset = await (
			from a in dbContext.PostMediaAsset
			where a.Id == assetId
				&& a.TenantId == tenantId
				&& a.PostId == postId
				&& !a.IsDeleted
			select a
		).FirstOrDefaultAsync(cancellationToken);
		if (asset is null) {
			return null;
		}

		asset.AltText = altText;
		asset.UpdatedAt = DateTime.UtcNow;
		await dbContext.SaveChangesAsync(cancellationToken);
		return asset;
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
