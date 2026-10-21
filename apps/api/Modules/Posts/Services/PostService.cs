using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Publishing.Lib;

namespace PublyApp.Api.Modules.Posts.Services;

public record CreatePostArgs(
	Guid TenantId,
	Guid? ProjectId,
	string Body,
	Guid CreatedByUserId,
	IReadOnlyList<string>? Segments = null
);

public record UpdatePostArgs(
	Guid TenantId,
	Guid PostId,
	PatchField<Guid?> ProjectId,
	string? Body,
	PatchField<string?> ImageAltText,
	// Follow-up segments (thread, #2171): null leaves them untouched, an empty
	// list removes them all, otherwise they replace the post's follow-ups.
	IReadOnlyList<string>? Segments = null
);

public record FindPostsArgs(
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	string? Search
) {
	public const string DefaultSortId = "created_at";
}

public interface IPostService {
	Task<Post> CreateAsync(
		CreatePostArgs args,
		CancellationToken cancellationToken = default);

	Task<bool> ProjectExistsForTenantAsync(
		Guid tenantId,
		Guid projectId,
		CancellationToken cancellationToken = default);

	Task<FindPostsResult> FindForTenantAsync(
		Guid tenantId,
		FindPostsArgs args,
		CancellationToken cancellationToken = default);

	Task<Post?> GetByIdForTenantAsync(
		Guid tenantId,
		Guid id,
		CancellationToken cancellationToken = default);

	Task<UpdatePostResult> UpdateForTenantAsync(
		UpdatePostArgs args,
		CancellationToken cancellationToken = default);

	/// <summary>The post's follow-up segments (segments 2..N) in order.</summary>
	Task<IReadOnlyList<PostSegmentReadModel>> FindSegmentsAsync(
		Guid tenantId,
		Guid postId,
		CancellationToken cancellationToken = default);

	/// <summary>How many leading segments are already published (read-only in the editor).</summary>
	Task<int> GetPublishedSegmentCountAsync(
		Guid postId,
		CancellationToken cancellationToken = default);

	Task<bool> DeleteForTenantAsync(
		Guid tenantId,
		Guid id,
		CancellationToken cancellationToken = default);
}

public abstract record FindPostsResult {
	public sealed record Success(
		CursorPaginatedResult<PostListItem> Data
	) : FindPostsResult;

	public sealed record CursorNotFound(
		string Cursor
	) : FindPostsResult;

	public sealed record InvalidSortId(
		string SortId
	) : FindPostsResult;
}

public abstract record UpdatePostResult {
	public sealed record Success(Post Post) : UpdatePostResult;

	public sealed record NotFound : UpdatePostResult;

	public sealed record ProjectNotFound(Guid ProjectId) : UpdatePostResult;

	public sealed record ImageMissing : UpdatePostResult;

	/// <summary>The edit would change or drop an already-published segment.</summary>
	public sealed record SegmentsLocked : UpdatePostResult;
}

/// <summary>One follow-up segment: <see cref="Number"/> is its 1-based place in the thread (2..N).</summary>
public record PostSegmentReadModel {
	public required int Number { get; init; }
	public required string Body { get; init; }
}

public record PostListItem {
	public required Guid Id { get; init; }
	public required Guid? ProjectId { get; init; }
	public required string Status { get; init; }
	public required string BodyPreview { get; init; }
	public required Guid CreatedByUserId { get; init; }
	public required DateTime CreatedAt { get; init; }
	public required DateTime UpdatedAt { get; init; }
	/// <summary>The first image; kept for one release for old clients (use <see cref="Images"/>).</summary>
	public required PostImageReadModel? Image { get; init; }
	public required IReadOnlyList<PostImageReadModel> Images { get; init; }
}

/// <summary>
/// The attached post image projection served by detail and list read models.
/// URL follows the anonymously-served <c>/files</c> convention documented on
/// CreateStaffUpload: world-readable by URL, no tenant scoping, no expiry.
/// </summary>
public record PostImageReadModel {
	public required Guid Id { get; init; }
	public required int Position { get; init; }
	public required string Url { get; init; }
	public required string? AltText { get; init; }
	public required int WidthPx { get; init; }
	public required int HeightPx { get; init; }
}

[Service(ServiceLifetime.Scoped)]
public class PostService : IPostService {
	private const int _BodyPreviewLength = 280;

	private readonly AppDbContext _DbContext;
	private readonly ILogger<PostService> _Logger;

	public PostService(
		AppDbContext dbContext,
		ILogger<PostService> logger
	) {
		this._DbContext = dbContext;
		this._Logger = logger;
	}

	public async Task<Post> CreateAsync(
		CreatePostArgs args,
		CancellationToken cancellationToken = default
	) {
		var post = new Post {
			TenantId = args.TenantId,
			ProjectId = args.ProjectId,
			Body = args.Body,
			Status = PostStatus.Draft,
			CreatedByUserId = args.CreatedByUserId
		};
		// Minted up front so the follow-up segment rows can reference it in one save.
		var postId = Guid.CreateVersion7();
		post.Id = postId;

		await this._DbContext.Post.AddAsync(post, cancellationToken);
		var followUps = args.Segments ?? [];
		for (var index = 0; index < followUps.Count; index++) {
			this._DbContext.PostSegment.Add(new PostSegment {
				TenantId = args.TenantId,
				PostId = postId,
				Position = index + 1,
				Body = followUps[index],
			});
		}

		await this._DbContext.SaveChangesAsync(cancellationToken);

		if (this._Logger.IsEnabled(LogLevel.Information)) {
			this._Logger.LogInformation(
				"Created post {PostId} for tenant {TenantId} "
				+ "by user {UserId}",
				post.GetRequiredId(),
				args.TenantId,
				args.CreatedByUserId
			);
		}

		return post;
	}

	public async Task<FindPostsResult> FindForTenantAsync(
		Guid tenantId,
		FindPostsArgs args,
		CancellationToken cancellationToken = default
	) {
		var cursor = args.Cursor;
		var effectiveLimit = args.Limit
			?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortOrder = args.SortOrder ?? SortOrder.Desc;
		var effectiveSortId = args.SortId ?? "created_at";

		var sortFieldHandlers =
			new Dictionary<string, CursorSortFieldHandler<Post>>(
				StringComparer.OrdinalIgnoreCase
			) {
				["created_at"] = CursorSortFieldHandlerFactory.Create<Post, DateTime, Guid?>(
					cursorLookupQuery: () => this._DbContext.Post
						.AsNoTracking()
						.Where(p => p.TenantId == tenantId && !p.IsDeleted),
					keySelector: p => p.CreatedAt,
					idSelector: p => p.Id,
					cancellationToken
				),
				["updated_at"] = CursorSortFieldHandlerFactory.Create<Post, DateTime, Guid?>(
					cursorLookupQuery: () => this._DbContext.Post
						.AsNoTracking()
						.Where(p => p.TenantId == tenantId && !p.IsDeleted),
					keySelector: p => p.UpdatedAt,
					idSelector: p => p.Id,
					cancellationToken
				),
			};

		if (!sortFieldHandlers.TryGetValue(
			effectiveSortId, out CursorSortFieldHandler<Post>? handler
		)) {
			return new FindPostsResult.InvalidSortId(
				effectiveSortId
			);
		}

		IQueryable<Post> query =
			from p in this._DbContext.Post.AsNoTracking()
			where p.TenantId == tenantId && !p.IsDeleted
			select p;

		if (!string.IsNullOrWhiteSpace(args.Search)) {
			var pattern = "%" + LikePatternUtils.EscapeLikePattern(
				args.Search.Trim()
			) + "%";
			query = query.Where(p => EF.Functions.ILike(
				p.Body, pattern, LikePatternUtils.LikeEscapeChar
			));
		}

		if (cursor != Guid.Empty) {
			var cursorValue = await handler.GetCursorValue(cursor);
			if (cursorValue is null) {
				return new FindPostsResult.CursorNotFound(
					cursor.ToString()
				);
			}

			query = handler.ApplyFilter(
				query,
				cursorValue,
				effectiveSortOrder == SortOrder.Asc
			);
		}

		var orderedQuery = handler.ApplyOrdering(
			query,
			effectiveSortOrder == SortOrder.Asc
		);

		var results = await orderedQuery
			.Take(effectiveLimit + 1)
			.ToListAsync(cancellationToken);

		string? nextCursor = null;
		if (results.Count > effectiveLimit) {
			results.RemoveAt(results.Count - 1);
			nextCursor = results.Last().GetRequiredId().ToString();
		}

		// One batched lookup for the page's live image assets (up to four per post).
		var pagePostIds = results
			.Select(p => p.GetRequiredId())
			.ToList();
		var pageAssets = await (
			from a in this._DbContext.PostMediaAsset.AsNoTracking()
			where a.TenantId == tenantId
				&& pagePostIds.Contains(a.PostId)
				&& !a.IsDeleted
			orderby a.Position
			select a
		).ToListAsync(cancellationToken);
		var assetsByPost = pageAssets.ToLookup(a => a.PostId);

		var items = results.Select(p => PostService.ToListItem(
			p,
			assetsByPost[p.GetRequiredId()].ToList()
		)).ToList();

		return new FindPostsResult.Success(
			new CursorPaginatedResult<PostListItem> {
				Data = items,
				NextCursor = nextCursor,
			}
		);
	}

	public async Task<Post?> GetByIdForTenantAsync(
		Guid tenantId,
		Guid id,
		CancellationToken cancellationToken = default
	) {
		var postQuery =
			from p in this._DbContext.Post
			where p.Id == id
				&& p.TenantId == tenantId
				&& !p.IsDeleted
			select p;

		return await postQuery.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<UpdatePostResult> UpdateForTenantAsync(
		UpdatePostArgs args,
		CancellationToken cancellationToken = default
	) {
		var tenantId = args.TenantId;
		var id = args.PostId;
		var post = await this.GetByIdForTenantAsync(
			tenantId, id, cancellationToken
		);

		if (post is null) {
			return new UpdatePostResult.NotFound();
		}

		var segmentsLocked = await this._ApplySegmentsAsync(post, args, cancellationToken);
		if (segmentsLocked) {
			return new UpdatePostResult.SegmentsLocked();
		}

		if (args.Body is not null) {
			post.Body = args.Body;
		}

		if (args.ImageAltText.IsPresent) {
			// Legacy single-image alt-text patch: targets the FIRST image (the
			// per-image route is PATCH /posts/{id}/images/{assetId}). A patch
			// without an image is a named validation refusal, not a silent no-op.
			var asset = await (
				from a in this._DbContext.PostMediaAsset
				where a.TenantId == tenantId
					&& a.PostId == id
					&& !a.IsDeleted
				orderby a.Position
				select a
			).FirstOrDefaultAsync(cancellationToken);
			if (asset is null) {
				return new UpdatePostResult.ImageMissing();
			}
			asset.AltText = args.ImageAltText.Value;
			asset.UpdatedAt = DateTime.UtcNow;
		}

		if (args.ProjectId.IsPresent) {
			var projectId = args.ProjectId.Value;
			if (projectId.HasValue) {
				var projectExists = await (
					from project in this._DbContext.Project.AsNoTracking()
					where project.Id == projectId.Value
						&& project.TenantId == tenantId
						&& !project.IsDeleted
					select project.Id
				).AnyAsync(cancellationToken);

				if (!projectExists) {
					return new UpdatePostResult.ProjectNotFound(
						projectId.Value
					);
				}
			}

			post.ProjectId = projectId;
		}

		await this._DbContext.SaveChangesAsync(cancellationToken);

		if (this._Logger.IsEnabled(LogLevel.Information)) {
			this._Logger.LogInformation(
				"Updated post {PostId} for tenant {TenantId}",
				id,
				tenantId
			);
		}

		return new UpdatePostResult.Success(post);
	}

	/// <summary>
	/// Stages the follow-up replacement and enforces the read-only rule for
	/// already-published segments of a thread. Returns true when the edit must be
	/// refused (nothing has been changed at that point).
	/// </summary>
	private async Task<bool> _ApplySegmentsAsync(
		Post post,
		UpdatePostArgs args,
		CancellationToken cancellationToken
	) {
		if (args.Segments is null && args.Body is null) {
			return false;
		}

		var postId = post.GetRequiredId();
		var existing = await (
			from segment in this._DbContext.PostSegment
			where segment.PostId == postId && !segment.IsDeleted
			orderby segment.Position
			select segment
		).ToListAsync(cancellationToken);

		var published = existing.Count > 0
			? await ThreadSegments.PublishedSegmentCountAsync(
				this._DbContext, postId, cancellationToken
			)
			: 0;
		if (published > 0) {
			var before = new List<string> { post.Body };
			before.AddRange(existing.Select(segment => segment.Body));
			var after = new List<string> { args.Body ?? post.Body };
			after.AddRange(args.Segments ?? existing.Select(segment => segment.Body).ToList());
			for (var index = 0; index < published; index++) {
				if (index >= after.Count || after[index] != before[index]) {
					return true;
				}
			}
		}

		if (args.Segments is null) {
			return false;
		}

		for (var index = 0; index < args.Segments.Count; index++) {
			var current = existing.FirstOrDefault(segment => segment.Position == index + 1);
			if (current is null) {
				this._DbContext.PostSegment.Add(new PostSegment {
					TenantId = post.TenantId,
					PostId = postId,
					Position = index + 1,
					Body = args.Segments[index],
				});
			} else if (current.Body != args.Segments[index]) {
				current.Body = args.Segments[index];
				current.UpdatedAt = DateTime.UtcNow;
			}
		}

		foreach (var surplus in existing.Where(segment => segment.Position > args.Segments.Count)) {
			this._DbContext.PostSegment.Remove(surplus);
		}

		await ThreadSegments.PruneTextOverridesAsync(
			this._DbContext, postId, args.Segments.Count + 1, cancellationToken
		);

		return false;
	}

	public async Task<IReadOnlyList<PostSegmentReadModel>> FindSegmentsAsync(
		Guid tenantId,
		Guid postId,
		CancellationToken cancellationToken = default
	) {
		return await (
			from segment in this._DbContext.PostSegment.AsNoTracking()
			where segment.TenantId == tenantId
				&& segment.PostId == postId
				&& !segment.IsDeleted
			orderby segment.Position
			select new PostSegmentReadModel {
				Number = segment.Position + 1,
				Body = segment.Body,
			}
		).ToListAsync(cancellationToken);
	}

	public async Task<int> GetPublishedSegmentCountAsync(
		Guid postId,
		CancellationToken cancellationToken = default
	) {
		return await ThreadSegments.PublishedSegmentCountAsync(
			this._DbContext, postId, cancellationToken
		);
	}

	public async Task<bool> DeleteForTenantAsync(
		Guid tenantId,
		Guid id,
		CancellationToken cancellationToken = default
	) {
		var post = await this.GetByIdForTenantAsync(
			tenantId, id, cancellationToken
		);

		if (post is null) {
			return false;
		}

		this._DbContext.Post.Remove(post);
		await this._DbContext.SaveChangesAsync(cancellationToken);

		if (this._Logger.IsEnabled(LogLevel.Information)) {
			this._Logger.LogInformation(
				"Deleted post {PostId} for tenant {TenantId}",
				id,
				tenantId
			);
		}

		return true;
	}

	public async Task<bool> ProjectExistsForTenantAsync(
		Guid tenantId,
		Guid projectId,
		CancellationToken cancellationToken = default
	) {
		return await (
			from project in this._DbContext.Project.AsNoTracking()
			where project.Id == projectId
				&& project.TenantId == tenantId
				&& !project.IsDeleted
			select project.Id
		).AnyAsync(cancellationToken);
	}

	internal static PostListItem ToListItem(Post post, IReadOnlyList<PostMediaAsset> assets) {
		return new PostListItem {
			Id = post.GetRequiredId(),
			ProjectId = post.ProjectId,
			Status = PostWire.FormatStatus(post.Status),
			BodyPreview = post.Body.Length <= PostService._BodyPreviewLength
				? post.Body
				: post.Body[..PostService._BodyPreviewLength],
			CreatedByUserId = post.CreatedByUserId,
			CreatedAt = post.CreatedAt,
			UpdatedAt = post.UpdatedAt,
			Image = PostWire.FormatImage(assets.OrderBy(a => a.Position).FirstOrDefault()),
			Images = PostWire.FormatImages(assets),
		};
	}
}
