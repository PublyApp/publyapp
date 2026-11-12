using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Posts.Services;
using PublyApp.Api.Modules.Uploads.Services;

namespace PublyApp.Api.Modules.Posts.Handlers.Tenant;

/// <summary>Appends ONE image to a follow-up segment (multipart <c>file</c> field; at most four, #2181).</summary>
public sealed class AttachSegmentImageForTenant {
	public static async Task<IResult> Handle(
		[FromRoute] string postId,
		[FromRoute] string segmentId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IPostMediaAssetService assetService,
		[FromServices] IUploadAssetReferenceService uploadReferences,
		[FromServices] IUploadAdmissionService uploadAdmissionService,
		[FromServices] IFileStorage fileStorage,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] ILogger<AttachSegmentImageForTenant> logger,
		IFormFile? file,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(segmentId, out var segmentIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid segmentId",
				ResponseKeys.MalformedId
			);
		}

		return await AttachPostImageForTenant.AttachAsync(
			postId, segmentIdGuid, authContext, assetService, uploadReferences,
			uploadAdmissionService, fileStorage, auditLogService, logger, file, cancellationToken
		);
	}
}
