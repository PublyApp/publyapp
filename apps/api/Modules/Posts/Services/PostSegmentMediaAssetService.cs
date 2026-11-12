using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Publishing.Lib;
using PublyApp.Api.Modules.Publishing.Providers.Capabilities;

namespace PublyApp.Api.Modules.Posts.Services;

public record FindOwnedSegmentArgs(
	Guid TenantId,
	Guid PostId,
	Guid SegmentId
);

public record AttachSegmentMediaArgs(
	Guid TenantId,
	Guid PostId,
	Guid SegmentId,
	string RelativePath,
	string ContentType,
	int WidthPx,
	int HeightPx,
	long SizeBytes,
	Guid UploadedByUserId
);

public record RemoveSegmentMediaArgs(
	Guid TenantId,
	Guid PostId,
	Guid SegmentId,
	Guid AssetId
);

public record ReorderSegmentMediaArgs(
	Guid TenantId,
	Guid PostId,
	Guid SegmentId,
	IReadOnlyList<Guid> OrderedAssetIds
);

public record SetSegmentMediaAltTextArgs(
	Guid TenantId,
	Guid PostId,
	Guid SegmentId,
	Guid AssetId,
	string? AltText
);

public abstract record AttachSegmentMediaResult {
	public sealed record Attached(PostSegmentMediaAsset Asset) : AttachSegmentMediaResult;

	/// <summary>The segment already holds the most images a thread destination takes.</summary>
	public sealed record LimitReached(int MaxImages) : AttachSegmentMediaResult;
}

public abstract record ReorderSegmentMediaResult {
	public sealed record Reordered(IReadOnlyList<PostSegmentMediaAsset> Assets) : ReorderSegmentMediaResult;

	/// <summary>The submitted ids are not exactly the segment's live image ids.</summary>
	public sealed record IdsMismatch : ReorderSegmentMediaResult;
}

/// <summary>
/// Images of follow-up segments (#2181), kept in their own table so an older app version
/// never reads them as the post's images. The calling handler owns the upload-reference
/// discipline exactly as for the post's own images (acquire before, release after).
/// </summary>
public interface IPostSegmentMediaAssetService {
	/// <summary>The follow-up segment of this tenant's post, or null (unknown or foreign: invisible).</summary>
	Task<PostSegment?> FindOwnedSegmentAsync(
		FindOwnedSegmentArgs args,
		CancellationToken cancellationToken = default
	);

	/// <summary>How many leading segments are already published (their images are read-only).</summary>
	Task<int> GetPublishedSegmentCountAsync(
		Guid postId,
		CancellationToken cancellationToken = default
	);

	Task<IReadOnlyList<PostSegmentMediaAsset>> ListAsync(
		FindOwnedSegmentArgs args,
		CancellationToken cancellationToken = default
	);

	Task<AttachSegmentMediaResult> AttachAsync(
		AttachSegmentMediaArgs args,
		CancellationToken cancellationToken = default
	);

	/// <summary>Hard-deletes one image and closes the gap; returns its blob path, or null when absent.</summary>
	Task<string?> RemoveAsync(
		RemoveSegmentMediaArgs args,
		CancellationToken cancellationToken = default
	);

	Task<ReorderSegmentMediaResult> ReorderAsync(
		ReorderSegmentMediaArgs args,
		CancellationToken cancellationToken = default
	);

	Task<PostSegmentMediaAsset?> SetAltTextAsync(
		SetSegmentMediaAltTextArgs args,
		CancellationToken cancellationToken = default
	);

	/// <summary>
	/// Stages the hard deletion of every segment image of a post and returns the blob paths
	/// whose references the handler releases after its own commit (post deletion).
	/// </summary>
	Task<IReadOnlyList<string>> StagePurgeOnPostDeleteAsync(
		Guid tenantId,
		Guid postId,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public sealed class PostSegmentMediaAssetService(AppDbContext dbContext)
	: IPostSegmentMediaAssetService {
	public async Task<PostSegment?> FindOwnedSegmentAsync(
		FindOwnedSegmentArgs args,
		CancellationToken cancellationToken = default
	) {
		var query =
			from segment in dbContext.PostSegment.AsNoTracking()
			where segment.Id == args.SegmentId
				&& segment.PostId == args.PostId
				&& segment.TenantId == args.TenantId
				&& !segment.IsDeleted
			select segment;
		return await query.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<int> GetPublishedSegmentCountAsync(
		Guid postId,
		CancellationToken cancellationToken = default
	) {
		return await ThreadSegments.PublishedSegmentCountAsync(dbContext, postId, cancellationToken);
	}

	public async Task<IReadOnlyList<PostSegmentMediaAsset>> ListAsync(
		FindOwnedSegmentArgs args,
		CancellationToken cancellationToken = default
	) {
		var query =
			from a in dbContext.PostSegmentMediaAsset.AsNoTracking()
			where a.TenantId == args.TenantId
				&& a.PostId == args.PostId
				&& a.SegmentId == args.SegmentId
				&& !a.IsDeleted
			orderby a.Position
			select a;
		return await query.ToListAsync(cancellationToken);
	}

	public async Task<AttachSegmentMediaResult> AttachAsync(
		AttachSegmentMediaArgs args,
		CancellationToken cancellationToken = default
	) {
		var livePositions = await (
			from a in dbContext.PostSegmentMediaAsset
			where a.TenantId == args.TenantId
				&& a.SegmentId == args.SegmentId
				&& !a.IsDeleted
			select a.Position
		).ToListAsync(cancellationToken);
		var max = ProviderCapabilityRegistry.MaxImagesPerFollowUp;
		if (livePositions.Count >= max) {
			return new AttachSegmentMediaResult.LimitReached(max);
		}

		// One past the highest live position, not the count: a concurrent remove can leave
		// a gap. Two racing appends compute the same slot; the unique index lets one commit.
		var asset = new PostSegmentMediaAsset {
			TenantId = args.TenantId,
			PostId = args.PostId,
			SegmentId = args.SegmentId,
			Position = livePositions.Count == 0 ? 0 : livePositions.Max() + 1,
			RelativePath = args.RelativePath,
			ContentType = args.ContentType,
			AltText = null,
			WidthPx = args.WidthPx,
			HeightPx = args.HeightPx,
			SizeBytes = args.SizeBytes,
			UploadedByUserId = args.UploadedByUserId,
		};
		await dbContext.PostSegmentMediaAsset.AddAsync(asset, cancellationToken);
		await dbContext.SaveChangesAsync(cancellationToken);
		return new AttachSegmentMediaResult.Attached(asset);
	}

	public async Task<string?> RemoveAsync(
		RemoveSegmentMediaArgs args,
		CancellationToken cancellationToken = default
	) {
		await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
		var assets = await (
			from a in dbContext.PostSegmentMediaAsset
			where a.TenantId == args.TenantId
				&& a.SegmentId == args.SegmentId
				&& !a.IsDeleted
			orderby a.Position
			select a
		).ToListAsync(cancellationToken);
		var target = assets.FirstOrDefault(a => a.Id == args.AssetId);
		if (target is null) {
			return null;
		}

		dbContext.ForceHardDelete(target);
		await dbContext.SaveChangesAsync(cancellationToken);
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
		return target.RelativePath;
	}

	public async Task<ReorderSegmentMediaResult> ReorderAsync(
		ReorderSegmentMediaArgs args,
		CancellationToken cancellationToken = default
	) {
		await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
		var assets = await (
			from a in dbContext.PostSegmentMediaAsset
			where a.TenantId == args.TenantId
				&& a.SegmentId == args.SegmentId
				&& !a.IsDeleted
			select a
		).ToListAsync(cancellationToken);
		var wanted = args.OrderedAssetIds.ToHashSet();
		if (wanted.Count != args.OrderedAssetIds.Count
			|| wanted.Count != assets.Count
			|| !assets.All(a => wanted.Contains(a.GetRequiredId()))) {
			return new ReorderSegmentMediaResult.IdsMismatch();
		}

		// Two phases: the unique (segment, position) index is checked row by row.
		for (var index = 0; index < assets.Count; index++) {
			assets[index].Position = -(index + 1);
		}

		await dbContext.SaveChangesAsync(cancellationToken);
		var ordered = new List<PostSegmentMediaAsset>(assets.Count);
		for (var index = 0; index < args.OrderedAssetIds.Count; index++) {
			var asset = assets.First(a => a.Id == args.OrderedAssetIds[index]);
			asset.Position = index;
			asset.UpdatedAt = DateTime.UtcNow;
			ordered.Add(asset);
		}

		await dbContext.SaveChangesAsync(cancellationToken);
		await transaction.CommitAsync(cancellationToken);
		return new ReorderSegmentMediaResult.Reordered(ordered);
	}

	public async Task<PostSegmentMediaAsset?> SetAltTextAsync(
		SetSegmentMediaAltTextArgs args,
		CancellationToken cancellationToken = default
	) {
		var asset = await (
			from a in dbContext.PostSegmentMediaAsset
			where a.Id == args.AssetId
				&& a.TenantId == args.TenantId
				&& a.PostId == args.PostId
				&& a.SegmentId == args.SegmentId
				&& !a.IsDeleted
			select a
		).FirstOrDefaultAsync(cancellationToken);
		if (asset is null) {
			return null;
		}

		asset.AltText = args.AltText;
		asset.UpdatedAt = DateTime.UtcNow;
		await dbContext.SaveChangesAsync(cancellationToken);
		return asset;
	}

	public async Task<IReadOnlyList<string>> StagePurgeOnPostDeleteAsync(
		Guid tenantId,
		Guid postId,
		CancellationToken cancellationToken = default
	) {
		var assets = await (
			from a in dbContext.PostSegmentMediaAsset
			where a.TenantId == tenantId
				&& a.PostId == postId
				&& !a.IsDeleted
			select a
		).ToListAsync(cancellationToken);
		if (assets.Count == 0) {
			return [];
		}

		dbContext.ForceHardDeleteRange(assets);
		return assets.Select(a => a.RelativePath).ToList();
	}
}
