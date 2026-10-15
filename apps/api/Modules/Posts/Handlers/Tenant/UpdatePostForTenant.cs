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

public record UpdatePostBody {
	public JsonElement? Body { get; init; }
	public JsonElement ProjectId { get; init; }
	public JsonElement ImageAltText { get; init; }
	public JsonElement Segments { get; init; }

	public string? GetBody() {
		return this.Body.GetValueAsStringOrNull();
	}

	// Follow-up segments (segments 2..N, #2171); absent = no follow-ups / untouched.
	public IReadOnlyList<string>? GetSegments() {
		if (this.Segments.ValueKind != JsonValueKind.Array) {
			return null;
		}

		return this.Segments.EnumerateArray()
			.Select(item => item.GetString() ?? string.Empty)
			.ToList();
	}

	public PatchField<Guid?> GetProjectId() {
		return this.ProjectId.ValueKind switch {
			JsonValueKind.Undefined =>
				PatchField<Guid?>.Absent(),
			JsonValueKind.Null =>
				PatchField<Guid?>.Set(null),
			JsonValueKind.String => Guid.TryParse(
				this.ProjectId.GetString(), out var guid
			) && guid != Guid.Empty
				? PatchField<Guid?>.Set(guid)
				: throw new InvalidOperationException(
					"ProjectId must be a valid GUID"
				),
			JsonValueKind.Object
				or JsonValueKind.Array
				or JsonValueKind.Number
				or JsonValueKind.True
				or JsonValueKind.False => throw new InvalidOperationException(
					"ProjectId must be a GUID, null, or omitted"
				),
			_ => throw new ArgumentOutOfRangeException(
				nameof(this.ProjectId),
				this.ProjectId.ValueKind,
				$"Unhandled JsonValueKind: {this.ProjectId.ValueKind}"
			),
		};
	}

	public PatchField<string?> GetImageAltText() {
		return this.ImageAltText.ValueKind switch {
			JsonValueKind.Undefined => PatchField<string?>.Absent(),
			// Explicit null clears the stored alt text.
			JsonValueKind.Null => PatchField<string?>.Set(null),
			JsonValueKind.String => PatchField<string?>.Set(
				this.ImageAltText.GetValueAsString()
			),
			JsonValueKind.Object
				or JsonValueKind.Array
				or JsonValueKind.Number
				or JsonValueKind.True
				or JsonValueKind.False => throw new InvalidOperationException(
					"ImageAltText must be a string, null, or omitted"
				),
			_ => throw new ArgumentOutOfRangeException(
				nameof(this.ImageAltText),
				this.ImageAltText.ValueKind,
				$"Unhandled JsonValueKind: {this.ImageAltText.ValueKind}"
			),
		};
	}
}

public class UpdatePostBodyValidator
	: AbstractValidator<UpdatePostBody> {
	public UpdatePostBodyValidator() {
		this.RuleFor(x => x.Body)
			.MustBeNullableStringWithMaxLength(
				"Body", PostValidationRules.BodyMaxLength
			);

		this.RuleFor(x => x.ProjectId)
			.MustBePatchFieldNonEmptyGuid("ProjectId");

		this.RuleFor(x => x.ImageAltText)
			.MustBePatchFieldString(
				"ImageAltText",
				PostValidationRules.ImageAltTextMaxLength
			);

		this.RuleFor(x => x.Segments)
			.MustBeRequiredStringArrayAllowingEmpty(
				"Segments",
				"segment",
				PostValidationRules.MaxFollowUpSegments,
				PostValidationRules.BodyMaxLength
			)
			.When(x => x.Segments.ValueKind != JsonValueKind.Undefined);
	}
}

public record PostUpdated {
	public required Guid Id { get; init; }
	public required Guid TenantId { get; init; }
	public required Guid? ProjectId { get; init; }
	public required string Status { get; init; }
	public required string Body { get; init; }
	public required Guid CreatedByUserId { get; init; }
	public required DateTime CreatedAt { get; init; }
	public required DateTime UpdatedAt { get; init; }
}

public sealed class UpdatePostForTenant {
	public static async Task<Results<
		Ok<PostUpdated>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppValidationProblemHttpResult
	>> Handle(
		[FromRoute] string postId,
		[FromBody] UpdatePostBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IPostService postService,
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

		var postBody = body.GetBody();
		var projectId = body.GetProjectId();
		var imageAltText = body.GetImageAltText();
		var segments = body.GetSegments();

		if (postBody is null && !projectId.IsPresent && !imageAltText.IsPresent
			&& segments is null) {
			return TypedProblems.BadRequest(
				"No fields to update",
				ResponseKeys.BadRequest
			);
		}

		if (postBody is not null
			&& string.IsNullOrWhiteSpace(postBody)) {
			return TypedProblems.ValidationProblem(
				"Body must not be empty",
				ResponseKeys.BadRequest,
				new Dictionary<string, string[]> {
					["body"] = ["Body must not be empty."],
				}
			);
		}

		if (postBody is not null
			&& postBody.Length > PostValidationRules.BodyMaxLength) {
			return TypedProblems.ValidationProblem(
				"Body exceeds maximum length",
				ResponseKeys.BadRequest,
				new Dictionary<string, string[]> {
					["body"] = [
						$"Body must be {PostValidationRules.BodyMaxLength} characters or less."
					],
				}
			);
		}

		var args = new UpdatePostArgs(
			TenantId: tenantId,
			PostId: postIdGuid,
			ProjectId: projectId,
			Body: postBody,
			ImageAltText: imageAltText,
			Segments: segments
		);

		var result = await postService.UpdateForTenantAsync(
			args, cancellationToken
		);

		if (result is UpdatePostResult.NotFound) {
			return TypedProblems.NotFound(
				"Post not found",
				ResponseKeys.NotFound
			);
		}

		if (result is UpdatePostResult.ProjectNotFound) {
			return TypedProblems.ValidationProblem(
				"Project does not exist for this tenant",
				ResponseKeys.NotFound,
				new Dictionary<string, string[]> {
					["projectId"] = [
						"The referenced project does not exist in this tenant."
					],
				}
			);
		}

		if (result is UpdatePostResult.ImageMissing) {
			return TypedProblems.ValidationProblem(
				"No image is attached to this post",
				ResponseKeys.PostImageMissing,
				new Dictionary<string, string[]> {
					["imageAltText"] = [
						"Alt text can only be set on an attached image."
					],
				}
			);
		}

		if (result is UpdatePostResult.SegmentsLocked) {
			return TypedProblems.ValidationProblem(
				"Segments that are already published cannot be changed",
				ResponseKeys.PostSegmentsLocked,
				new Dictionary<string, string[]> {
					["segments"] = [
						"Published segments are read-only: keep their text and order."
					],
				}
			);
		}

		if (result is not UpdatePostResult.Success success) {
			throw new InvalidOperationException(
				"Unhandled result type"
			);
		}

		var updatedPost = success.Post;
		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.PostUpdated,
				TargetId: postIdGuid,
				Details: new {
					TenantId = tenantId,
					ProjectId = projectId.IsPresent
						? projectId.Value
						: null,
					BodyLength = postBody?.Length,
				}
			),
			cancellationToken
		);

		return TypedResults.Ok(new PostUpdated {
			Id = updatedPost.GetRequiredId(),
			TenantId = updatedPost.TenantId,
			ProjectId = updatedPost.ProjectId,
			Status = PostWire.FormatStatus(updatedPost.Status),
			Body = updatedPost.Body,
			CreatedByUserId = updatedPost.CreatedByUserId,
			CreatedAt = updatedPost.CreatedAt,
			UpdatedAt = updatedPost.UpdatedAt,
		});
	}
}
