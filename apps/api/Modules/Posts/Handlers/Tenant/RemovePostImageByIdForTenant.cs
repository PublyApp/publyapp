using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Posts.Services;
using PublyApp.Api.Modules.Uploads.Services;

namespace PublyApp.Api.Modules.Posts.Handlers.Tenant;

/// <summary>
/// Removes ONE image of a post by its asset id (#2170); remaining images close
/// the position gap. Shares its logic with the legacy single-image route.
/// </summary>
public sealed class RemovePostImageByIdForTenant {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string postId,
		[FromRoute] string assetId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IPostMediaAssetService assetService,
		[FromServices] IUploadAssetReferenceService uploadReferences,
		[FromServices] IAuditLogService auditLogService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(assetId, out var assetIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid assetId",
				ResponseKeys.MalformedId
			);
		}

		return await RemovePostImageForTenant.RemoveAsync(
			postId,
			assetIdGuid,
			authContext,
			assetService,
			uploadReferences,
			auditLogService,
			cancellationToken
		);
	}
}
