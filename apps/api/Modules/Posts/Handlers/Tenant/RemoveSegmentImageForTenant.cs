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
/// Removes ONE image of a follow-up segment by its asset id (#2181); the segment's
/// remaining images close the position gap. A published segment is read-only.
/// </summary>
public sealed class RemoveSegmentImageForTenant {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppValidationProblemHttpResult
	>> Handle(
		[FromRoute] string postId,
		[FromRoute] string segmentId,
		[FromRoute] string assetId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IPostMediaAssetService assetService,
		[FromServices] IUploadAssetReferenceService uploadReferences,
		[FromServices] IAuditLogService auditLogService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(assetId, out var assetIdGuid)
			|| !Guid.TryParse(segmentId, out var segmentIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid segmentId or assetId",
				ResponseKeys.MalformedId
			);
		}

		return await RemovePostImageForTenant.RemoveAsync(
			postId,
			assetIdGuid,
			segmentIdGuid,
			authContext,
			assetService,
			uploadReferences,
			auditLogService,
			cancellationToken
		);
	}
}
