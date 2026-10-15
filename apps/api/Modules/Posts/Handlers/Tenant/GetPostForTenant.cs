using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Posts.Services;

namespace PublyApp.Api.Modules.Posts.Handlers.Tenant;

public sealed class GetPostForTenant {
	public static async Task<Results<
		Ok<PostDetail>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string postId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IPostService postService,
		[FromServices] IPostMediaAssetService assetService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException(
				$"{nameof(authContext.TenantId)} is not a GUID"
			);
		}

		var account = authContext.AccountTenant;
		if (account is null) {
			throw new InvalidOperationException(
				"Tenant account not found in auth context. "
				+ "Ensure the endpoint has "
				+ ".WithTenantPermission(...) middleware."
			);
		}

		if (!Guid.TryParse(postId, out var postIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid postId",
				ResponseKeys.MalformedId
			);
		}

		var post = await postService.GetByIdForTenantAsync(
			tenantId, postIdGuid, cancellationToken
		);

		if (post is null) {
			return TypedProblems.NotFound(
				"Post not found",
				ResponseKeys.NotFound
			);
		}

		var assets = await assetService.ListByPostAsync(
			tenantId, postIdGuid, cancellationToken
		);

		var segments = await postService.FindSegmentsAsync(
			tenantId, postIdGuid, cancellationToken
		);
		var publishedSegmentCount = segments.Count > 0
			? await postService.GetPublishedSegmentCountAsync(postIdGuid, cancellationToken)
			: 0;

		return TypedResults.Ok(new PostDetail {
			Id = post.GetRequiredId(),
			TenantId = post.TenantId,
			ProjectId = post.ProjectId,
			Status = PostWire.FormatStatus(post.Status),
			Body = post.Body,
			CreatedByUserId = post.CreatedByUserId,
			CreatedAt = post.CreatedAt,
			UpdatedAt = post.UpdatedAt,
			Image = PostWire.FormatImage(assets.FirstOrDefault()),
			Images = PostWire.FormatImages(assets),
			Segments = segments,
			PublishedSegmentCount = publishedSegmentCount,
		});
	}
}

public record PostDetail {
	public required Guid Id { get; init; }
	public required Guid TenantId { get; init; }
	public required Guid? ProjectId { get; init; }
	public required string Status { get; init; }
	public required string Body { get; init; }
	public required Guid CreatedByUserId { get; init; }
	public required DateTime CreatedAt { get; init; }
	public required DateTime UpdatedAt { get; init; }
	/// <summary>The first image; kept for one release for old clients (use <see cref="Images"/>).</summary>
	public required PostImageReadModel? Image { get; init; }
	public required IReadOnlyList<PostImageReadModel> Images { get; init; }
	/// <summary>Follow-up segments (segments 2..N) of a thread; empty for a plain post.</summary>
	public required IReadOnlyList<PostSegmentReadModel> Segments { get; init; }
	/// <summary>Leading segments already published (read-only); 0 unless a thread went out.</summary>
	public required int PublishedSegmentCount { get; init; }
}
