using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Posts.Services;
using PublyApp.Api.Modules.Uploads.Services;

namespace PublyApp.Api.Modules.Posts.Handlers.Tenant;

/// <summary>
/// Legacy single-image removal (<c>DELETE /posts/{id}/image</c>), kept for one
/// release for old clients: removes the post's FIRST image. The per-image route
/// is <see cref="RemovePostImageByIdForTenant"/>, which shares this logic.
/// </summary>
public sealed class RemovePostImageForTenant {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string postId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IPostMediaAssetService assetService,
		[FromServices] IUploadAssetReferenceService uploadReferences,
		[FromServices] IAuditLogService auditLogService,
		CancellationToken cancellationToken = default
	) {
		return await RemovePostImageForTenant.RemoveAsync(
			postId,
			assetId: null,
			authContext,
			assetService,
			uploadReferences,
			auditLogService,
			cancellationToken
		);
	}

	internal static async Task<Results<
		Ok<ApiResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> RemoveAsync(
		string postId,
		Guid? assetId,
		IRequestAuthContext authContext,
		IPostMediaAssetService assetService,
		IUploadAssetReferenceService uploadReferences,
		IAuditLogService auditLogService,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException(
				$"{nameof(authContext.TenantId)} is not a GUID"
			);
		}

		var account = authContext.GetRequiredTenantAccount();

		if (!Guid.TryParse(postId, out var postIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid postId",
				ResponseKeys.MalformedId
			);
		}

		// Same isolation point as attach: foreign-tenant posts are invisible.
		var post = await assetService.FindOwnedPostAsync(
			tenantId, postIdGuid, cancellationToken
		);
		if (post is null) {
			return TypedProblems.NotFound(
				"Post not found",
				ResponseKeys.PostNotFound
			);
		}

		// #1461: the HANDLER owns the #807 F5 reference discipline — the service
		// commits the row's hard delete and hands back the blob path; THIS handler
		// releases the blob's reference only AFTER that commit. Physical deletion
		// stays exclusively sweeper's.
		var removedPath = await assetService.RemoveAsync(
			new RemovePostMediaArgs(tenantId, postIdGuid, assetId), cancellationToken
		);
		if (removedPath is null) {
			return TypedProblems.NotFound(
				"No image is attached to this post",
				ResponseKeys.PostImageMissing
			);
		}

		await uploadReferences.TryReleaseReferenceAsync(
			removedPath, cancellationToken
		);

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.PostUpdated,
				TargetId: postIdGuid,
				Details: new {
					TenantId = tenantId,
					ImageRemoved = true,
					ImageId = assetId,
				}
			),
			cancellationToken
		);

		return TypedResults.Ok(
			ApiResponse.Create(
				"Post image removed successfully",
				ResponseKeys.PostImageRemovedSuccess
			)
		);
	}
}
