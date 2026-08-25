using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Posts.Validation;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Services;
using PublyApp.Api.Modules.Tenants.Validation;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

public record EditPostScheduleBody {
	public JsonElement? Body { get; init; }
	public JsonElement ScheduledAtLocal { get; init; }
	public JsonElement TimeZone { get; init; }

	public PatchField<string>? GetBody() {
		if (Body is null
			|| Body.Value.ValueKind is JsonValueKind.Undefined
				or JsonValueKind.Null) {
			return null;
		}

		return PatchField<string>.Set(Body.Value.GetString() ?? string.Empty);
	}

	public PatchField<DateTime> GetScheduledAtLocal() {
		var kind = ScheduledAtLocal.ValueKind;
		if (kind is JsonValueKind.Undefined or JsonValueKind.Null) {
			return PatchField<DateTime>.Absent();
		}

		if (kind == JsonValueKind.String
			&& DateUtils.TryParseIsoUtc(
				ScheduledAtLocal.GetString(),
				out var utc
			)) {
			return PatchField<DateTime>.Set(utc);
		}

		throw new InvalidOperationException(
			"ScheduledAtLocal must be an ISO 8601 instant"
		);
	}

	public PatchField<string> GetTimeZone() {
		var kind = TimeZone.ValueKind;
		if (kind is JsonValueKind.Undefined or JsonValueKind.Null) {
			return PatchField<string>.Absent();
		}

		if (kind == JsonValueKind.String) {
			return PatchField<string>.Set(
				TimeZone.GetString() ?? string.Empty
			);
		}

		throw new InvalidOperationException(
			"TimeZone must be an IANA identifier"
		);
	}
}

public sealed class EditPostScheduleBodyValidator
	: AbstractValidator<EditPostScheduleBody> {
	public EditPostScheduleBodyValidator() {
		RuleFor(x => x.Body)
			.MustBeNullableStringWithMaxLength(
				"Body", PostValidationRules.BodyMaxLength
			);

		RuleFor(x => x.ScheduledAtLocal)
			.MustBePatchFieldIsoDateTime("ScheduledAtLocal");

		RuleFor(x => x.TimeZone)
			.MustBePatchFieldTimezone();
	}
}

public record EditPostScheduleResponse {
	public required Guid PostId { get; init; }
	public required IReadOnlyList<SchedulePostCreatedItem> Publications {
		get; init;
	}
}

public sealed class EditPostScheduleForTenant {
	public static async Task<Results<
		Ok<EditPostScheduleResponse>,
		AppBadRequestHttpResult,
		AppConflictHttpResult,
		AppNotFoundHttpResult,
		AppValidationProblemHttpResult
	>> Handle(
		[FromRoute] string postId,
		[FromBody] EditPostScheduleBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IPublicationService publicationService,
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
		var scheduledAtLocal = body.GetScheduledAtLocal();
		var timeZone = body.GetTimeZone();

		var hasFields = postBody is not null
			|| scheduledAtLocal.IsPresent
			|| timeZone.IsPresent;
		if (!hasFields) {
			return TypedProblems.BadRequest(
				"No fields to update",
				ResponseKeys.BadRequest
			);
		}

		var pendingBody = postBody?.Value;
		if (pendingBody is not null
			&& string.IsNullOrWhiteSpace(pendingBody)) {
			return TypedProblems.ValidationProblem(
				"Body must not be empty",
				ResponseKeys.BadRequest,
				new Dictionary<string, string[]> {
					["body"] = ["Body must not be empty."],
				}
			);
		}

		var result = await publicationService.EditScheduleAsync(
			new EditPostScheduleArgs(
				TenantId: tenantId,
				PostId: postIdGuid,
				Body: postBody ?? PatchField<string>.Absent(),
				ScheduledAtLocal: scheduledAtLocal,
				TimeZone: timeZone,
				ActorUserId: account.UserId
			),
			cancellationToken
		);

		return result switch {
			EditPostScheduleResult.NotFound =>
				TypedProblems.NotFound(
					"Post not found",
					ResponseKeys.NotFound
				),
			EditPostScheduleResult.InProgressConflict =>
				TypedProblems.Conflict(
					"One publication for this post is being published right "
						+ "now. Wait for it to finish, then edit again.",
					ResponseKeys.PublicationScheduleInProgress
				),
			EditPostScheduleResult.InvalidSchedule invalidSchedule =>
				TypedProblems.ValidationProblem(
					invalidSchedule.Cause,
					ResponseKeys.UnprocessableEntity,
					new Dictionary<string, string[]> {
						[invalidSchedule.ErrorKey] = [invalidSchedule.Cause],
					}
				),
			EditPostScheduleResult.Success success =>
				TypedResults.Ok(
					new EditPostScheduleResponse {
						PostId = postIdGuid,
						Publications = success.Rescheduled
							.Select(publication =>
								new SchedulePostCreatedItem {
									Id = publication.GetRequiredId(),
									SocialAccountId = publication.SocialAccountId,
									Status = PublicationWire.FormatStatus(
										publication.Status
									),
								}
							)
							.ToList(),
					}
				),
			_ => throw new InvalidOperationException(
				"Unhandled edit-schedule result kind"
			),
		};
	}
}
