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
/// Sets the alt text of one image of a follow-up segment (#2181); empty or null clears it.
/// A published segment is read-only: its remote record keeps the alt text it went out with.
/// </summary>
public sealed class UpdateSegmentImageForTenant {
	public static async Task<Results<
		Ok<PostImageReadModel>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppValidationProblemHttpResult
	>> Handle(
		[FromRoute] string postId,
		[FromRoute] string segmentId,
		[FromRoute] string assetId,
		[FromBody] UpdatePostImageBody body,
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

		if (!Guid.TryParse(postId, out var postIdGuid)
			|| !Guid.TryParse(segmentId, out var segmentIdGuid)
			|| !Guid.TryParse(assetId, out var assetIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid postId, segmentId or assetId",
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

		var altText = body.GetAltText();
		var asset = await segmentService.SetAltTextAsync(
			new SetSegmentMediaAltTextArgs(
				tenantId,
				postIdGuid,
				segmentIdGuid,
				assetIdGuid,
				string.IsNullOrWhiteSpace(altText) ? null : altText
			),
			cancellationToken
		);
		if (asset is null) {
			return TypedProblems.NotFound(
				"No such image is attached to this segment",
				ResponseKeys.PostImageMissing
			);
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.PostUpdated,
				TargetId: postIdGuid,
				Details: new {
					TenantId = tenantId,
					ImageId = assetIdGuid,
					SegmentId = segmentIdGuid,
					ImageAltTextUpdated = true,
				}
			),
			cancellationToken
		);

		var image = PostWire.FormatImage(asset);
		if (image is null) {
			throw new InvalidOperationException("A non-null asset must format to a read model.");
		}

		return TypedResults.Ok(image);
	}
}
