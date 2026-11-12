using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Posts.Services;

namespace PublyApp.Api.Modules.Posts.Handlers.Tenant;

/// <summary>
/// Reorders the images of one follow-up segment (#2181): the body lists EVERY live image id
/// of the segment exactly once. A published segment is read-only.
/// </summary>
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
		[FromServices] IPostSegmentMediaAssetService segmentService,
		[FromServices] IAuditLogService auditLogService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException(
				$"{nameof(authContext.TenantId)} is not a GUID"
			);
		}

		var account = authContext.GetRequiredTenantAccount();

		if (!Guid.TryParse(postId, out var postIdGuid) || !Guid.TryParse(segmentId, out var segmentIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid postId or segmentId",
				ResponseKeys.MalformedId
			);
		}

		var post = await assetService.FindOwnedPostAsync(tenantId, postIdGuid, cancellationToken);
		if (post is null) {
			return TypedProblems.NotFound("Post not found", ResponseKeys.PostNotFound);
		}

		var segment = await segmentService.FindOwnedSegmentAsync(
			new FindOwnedSegmentArgs(tenantId, postIdGuid, segmentIdGuid), cancellationToken
		);
		if (segment is null) {
			return TypedProblems.NotFound("Segment not found", ResponseKeys.PostSegmentNotFound);
		}

		var published = await segmentService.GetPublishedSegmentCountAsync(postIdGuid, cancellationToken);
		if (segment.Position + 1 <= published) {
			return TypedProblems.ValidationProblem(
				"Segments that are already published cannot be changed",
				ResponseKeys.PostSegmentsLocked,
				new Dictionary<string, string[]> {
					["segment"] = ["Published segments are read-only."],
				}
			);
		}

		var result = await segmentService.ReorderAsync(
			new ReorderSegmentMediaArgs(tenantId, postIdGuid, segmentIdGuid, body.GetAssetIds()),
			cancellationToken
		);
		if (result is not ReorderSegmentMediaResult.Reordered reordered) {
			const string message =
				"The image order must list every image of the segment exactly once";
			return TypedProblems.ValidationProblem(
				message,
				ResponseKeys.PostImagesOrderMismatch,
				new Dictionary<string, string[]> {
					{ "assetIds", [message] }
				}
			);
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.PostUpdated,
				TargetId: postIdGuid,
				Details: new {
					TenantId = tenantId,
					ImagesReordered = true,
					SegmentId = segmentIdGuid,
				}
			),
			cancellationToken
		);

		return TypedResults.Ok(new PostImagesReordered {
			Images = PostWire.FormatImages(reordered.Assets),
		});
	}
}
