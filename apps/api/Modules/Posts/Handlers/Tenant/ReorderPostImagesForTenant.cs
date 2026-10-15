using System.ComponentModel.DataAnnotations;
using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Posts.Services;
using PublyApp.Api.Modules.Publishing.Providers.Capabilities;

namespace PublyApp.Api.Modules.Posts.Handlers.Tenant;

public sealed class ReorderPostImagesBody {
	[Required]
	public JsonElement AssetIds { get; init; }

	public List<Guid> GetAssetIds() {
		var assetIds = new List<Guid>();

		foreach (var element in this.AssetIds.EnumerateArray()) {
			assetIds.Add(element.GetValueAsGuid());
		}

		return assetIds;
	}
}

public sealed class ReorderPostImagesBodyValidator
	: AbstractValidator<ReorderPostImagesBody> {
	public ReorderPostImagesBodyValidator() {
		this.RuleFor(x => x.AssetIds)
			.MustBeRequiredGuidArrayAllowingEmpty(
				fieldName: "assetIds",
				itemName: "assetId",
				maxCount: ProviderCapabilityRegistry.MaxImagesPerPost
			);
	}
}

public record PostImagesReordered {
	public required IReadOnlyList<PostImageReadModel> Images { get; init; }
}

/// <summary>
/// Reorders a post's images (#2170): the body lists EVERY live image id of the
/// post exactly once, in the wanted order.
/// </summary>
public sealed class ReorderPostImagesForTenant {
	public static async Task<Results<
		Ok<PostImagesReordered>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppValidationProblemHttpResult
	>> Handle(
		[FromRoute] string postId,
		[FromBody] ReorderPostImagesBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IPostMediaAssetService assetService,
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

		var post = await assetService.FindOwnedPostAsync(
			tenantId, postIdGuid, cancellationToken
		);
		if (post is null) {
			return TypedProblems.NotFound(
				"Post not found",
				ResponseKeys.PostNotFound
			);
		}

		var result = await assetService.ReorderAsync(
			new ReorderPostMediaArgs(tenantId, postIdGuid, body.GetAssetIds()), cancellationToken
		);
		if (result is not ReorderPostMediaResult.Reordered reordered) {
			const string message =
				"The image order must list every image of the post exactly once";
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
				}
			),
			cancellationToken
		);

		return TypedResults.Ok(new PostImagesReordered {
			Images = PostWire.FormatImages(reordered.Assets),
		});
	}
}
