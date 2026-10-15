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
using PublyApp.Api.Modules.Posts.Validation;

namespace PublyApp.Api.Modules.Posts.Handlers.Tenant;

public record UpdatePostImageBody {
	public JsonElement? AltText { get; init; }

	public string? GetAltText() {
		return this.AltText.GetValueAsStringOrNull();
	}
}

public class UpdatePostImageBodyValidator
	: AbstractValidator<UpdatePostImageBody> {
	public UpdatePostImageBodyValidator() {
		this.RuleFor(x => x.AltText)
			.MustBeNullableStringWithMaxLength(
				"AltText", PostValidationRules.ImageAltTextMaxLength
			);
	}
}

/// <summary>Sets the alt text of one image of a post (#2170); empty or null clears it.</summary>
public sealed class UpdatePostImageForTenant {
	public static async Task<Results<
		Ok<PostImageReadModel>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string postId,
		[FromRoute] string assetId,
		[FromBody] UpdatePostImageBody body,
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

		if (!Guid.TryParse(postId, out var postIdGuid)
			|| !Guid.TryParse(assetId, out var assetIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid postId or assetId",
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

		var altText = body.GetAltText();
		var asset = await assetService.SetAltTextAsync(
			new SetPostMediaAltTextArgs(
				tenantId,
				postIdGuid,
				assetIdGuid,
				string.IsNullOrWhiteSpace(altText) ? null : altText
			),
			cancellationToken
		);
		if (asset is null) {
			return TypedProblems.NotFound(
				"No such image is attached to this post",
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
