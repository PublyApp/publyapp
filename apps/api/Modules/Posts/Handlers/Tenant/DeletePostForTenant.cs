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

public sealed class DeletePostForTenant {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string postId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IPostService postService,
		[FromServices] IPostMediaAssetService postMediaAssets,
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

		// Cascade phase 1: stage the image-asset hard delete in this request's
		// unit of work BEFORE deleting the post. DeleteForTenantAsync's
		// SaveChanges then commits both atomically (shared scoped DbContext).
		var stagedPaths = await postMediaAssets.StagePurgeOnPostDeleteAsync(
			tenantId, postIdGuid, cancellationToken
		);

		var deleted = await postService.DeleteForTenantAsync(
			tenantId, postIdGuid, cancellationToken
		);

		if (!deleted) {
			return TypedProblems.NotFound(
				"Post not found",
				ResponseKeys.NotFound
			);
		}

		// Cascade phase 2 (#807 F5), owned by this handler (inlined since #1461:
		// the handler orchestrates the reference calls): release the purged images'
		// blob references only AFTER the deletion is durable; physical deletion
		// stays exclusively sweeper's.
		foreach (var stagedPath in stagedPaths) {
			await uploadReferences.TryReleaseReferenceAsync(
				stagedPath, cancellationToken
			);
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.PostDeleted,
				TargetId: postIdGuid,
				Details: new {
					TenantId = tenantId,
				}
			),
			cancellationToken
		);

		return TypedResults.Ok(
			ApiResponse.Create(
				"Post deleted successfully",
				ResponseKeys.PostDeletedSuccess
			)
		);
	}
}
