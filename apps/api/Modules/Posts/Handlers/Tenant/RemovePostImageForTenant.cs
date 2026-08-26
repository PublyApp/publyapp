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

		// #807 F5 discipline, owned by this handler: the service commits the
		// row's hard delete; THIS handler releases the blob's reference only
		// AFTER that commit. Physical deletion stays exclusively sweeper's.
		var releasedPath = await assetService.RemoveAsync(
			tenantId, postIdGuid, cancellationToken
		);
		if (releasedPath is null) {
			return TypedProblems.NotFound(
				"No image is attached to this post",
				ResponseKeys.PostImageMissing
			);
		}

		await uploadReferences.TryReleaseReferenceAsync(
			releasedPath,
			cancellationToken
		);

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.PostUpdated,
				TargetId: postIdGuid,
				Details: new {
					TenantId = tenantId,
					ImageRemoved = true,
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
