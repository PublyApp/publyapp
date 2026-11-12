using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Posts.Services;

namespace PublyApp.Api.Modules.Posts.Handlers.Tenant;

/// <summary>Reorders the images of one follow-up segment (#2181).</summary>
public sealed class ReorderSegmentImagesForTenant {
	public static async Task<Results<
		Ok<PostImagesReordered>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppValidationProblemHttpResult
	>> Handle(
		[FromRoute] string postId,
		[FromRoute] string segmentId,
		[FromBody] ReorderPostImagesBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IPostMediaAssetService assetService,
		[FromServices] IAuditLogService auditLogService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(segmentId, out var segmentIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid segmentId",
				ResponseKeys.MalformedId
			);
		}

		return await ReorderPostImagesForTenant.ReorderAsync(
			postId, segmentIdGuid, body, authContext, assetService, auditLogService, cancellationToken
		);
	}
}
