using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Uploads.Services;

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
	/// Persists the new asset row with #807 F5 reference discipline: acquire the
	/// blob's reference BEFORE the entity write, then release the replaced
	/// image's reference in the SAME unit of work, after SaveChanges. Physical
	/// deletion stays exclusively the sweeper's.
	/// </summary>
	Task AttachAsync(
		AttachPostMediaArgs args,
		CancellationToken cancellationToken = default
	);

	/// <summary>
	/// Removes a post's image: hard-deletes the asset row and releases the
	/// blob's reference after SaveChanges (same unit of work). Returns false
	/// when no live asset exists for the post.
	/// </summary>
	Task<bool> RemoveAsync(
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

	/// <summary>
	/// Post-deletion cascade, phase 2: releases the blob references collected by
	/// <see cref="StagePurgeOnPostDeleteAsync"/> AFTER the caller committed the
	/// deletion (#807 F5: never release before the owning write is durable).
	/// </summary>
	Task ReleaseReferencesAsync(
		IReadOnlyList<string> relativePaths,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public sealed class PostMediaAssetService(
	AppDbContext dbContext,
	IUploadAssetReferenceService uploadReferences
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

	public async Task AttachAsync(
		AttachPostMediaArgs args,
		CancellationToken cancellationToken = default
	) {
		var previousPath = await (
			from a in dbContext.PostMediaAsset
			where a.TenantId == args.TenantId
				&& a.PostId == args.PostId
				&& !a.IsDeleted
			select a.RelativePath
		).FirstOrDefaultAsync(cancellationToken);

		// Acquire the new blob's reference BEFORE the entity write so the URL
		// can never commit while its asset still reads zero references (#807 F5).
		await uploadReferences.TryAddReferenceAsync(
			args.RelativePath,
			cancellationToken
		);

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
		await dbContext.SaveChangesAsync(cancellationToken);

		// Release the replaced image's reference in the SAME unit of work as
		// the new row's commit; physical deletion stays exclusively sweeper's.
		if (previousPath is not null) {
			await uploadReferences.TryReleaseReferenceAsync(
				previousPath,
				cancellationToken
			);
		}
	}

	public async Task<bool> RemoveAsync(
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
			return false;
		}

		var releasedPath = asset.RelativePath;
		dbContext.ForceHardDelete(asset);
		await dbContext.SaveChangesAsync(cancellationToken);

		await uploadReferences.TryReleaseReferenceAsync(
			releasedPath,
			cancellationToken
		);
		return true;
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

	public async Task ReleaseReferencesAsync(
		IReadOnlyList<string> relativePaths,
		CancellationToken cancellationToken = default
	) {
		foreach (var path in relativePaths) {
			await uploadReferences.TryReleaseReferenceAsync(path, cancellationToken);
		}
	}
}
