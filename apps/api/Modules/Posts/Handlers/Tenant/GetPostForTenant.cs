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

		var asset = await assetService.FindByPostAsync(
			tenantId, postIdGuid, cancellationToken
		);

		return TypedResults.Ok(new PostDetail {
			Id = post.GetRequiredId(),
			TenantId = post.TenantId,
			ProjectId = post.ProjectId,
			Status = PostWire.FormatStatus(post.Status),
			Body = post.Body,
			CreatedByUserId = post.CreatedByUserId,
			CreatedAt = post.CreatedAt,
			UpdatedAt = post.UpdatedAt,
			Image = PostWire.FormatImage(asset),
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
	public required PostImageReadModel? Image { get; init; }
}
