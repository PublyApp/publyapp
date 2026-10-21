using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Lib;
using PublyApp.Api.Modules.Publishing.Services;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

/// <summary>
/// Schedules a post. Two shapes: the original <c>accountIds</c> + <c>scheduledAtLocal</c>
/// (one instant for every account), or <c>destinations</c> (#2172):
/// <c>[{socialAccountId, scheduledAt?, overrides?}]</c>, where a destination without
/// <c>scheduledAt</c> takes the top-level <c>scheduledAtLocal</c> ("same time for all").
/// </summary>
public record SchedulePostBody {
	public JsonElement AccountIds { get; init; }
	public JsonElement Destinations { get; init; }
	public JsonElement ScheduledAtLocal { get; init; }
	public required JsonElement TimeZone { get; init; }

	public bool HasDestinations() {
		return this.Destinations.ValueKind is not (JsonValueKind.Undefined or JsonValueKind.Null);
	}

	public IReadOnlyList<ScheduleDestination> GetDestinations() {
		var defaultAt = this.GetScheduledAtLocal();
		if (!this.HasDestinations()) {
			return this.AccountIds.EnumerateArray()
				.Select(item => item.GetGuid())
				.Distinct()
				.Select(id => new ScheduleDestination(id, defaultAt ?? DateTime.MinValue, null))
				.ToList();
		}

		if (!RenditionWire.TryParseDestinations(this.Destinations, true, out var parsed, out var error)) {
			throw new InvalidOperationException(error);
		}

		return parsed
			.Select(item => new ScheduleDestination(
				item.SocialAccountId,
				item.ScheduledAtUtc ?? defaultAt ?? DateTime.MinValue,
				item.Overrides
			))
			.ToList();
	}

	public DateTime? GetScheduledAtLocal() {
		if (this.ScheduledAtLocal.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null) {
			return null;
		}

		var raw = this.ScheduledAtLocal.GetValueAsString();
		if (DateUtils.TryParseIsoUtc(raw, out var utc)) {
			return utc;
		}

		throw new InvalidOperationException(
			"ScheduledAtLocal must be a valid ISO 8601 instant"
		);
	}

	public string GetTimeZone() {
		return this.TimeZone.GetValueAsString().Trim();
	}
}

public sealed class SchedulePostBodyValidator
	: AbstractValidator<SchedulePostBody> {
	public SchedulePostBodyValidator() {
		this.RuleFor(x => x.TimeZone)
			.MustBeRequiredTimezone(
				"TimeZone",
				PublicationSchedule.MaxTimeZoneLength
			);

		this.When(x => !x.HasDestinations(), () => {
			this.RuleFor(x => x.AccountIds)
				.MustBeRequiredGuidArray("AccountIds", "social account ID", 50);

			this.RuleFor(x => x.ScheduledAtLocal)
				.MustBeRequiredIsoDateTime("ScheduledAtLocal");
		});

		this.When(x => x.HasDestinations(), () => {
			this.RuleFor(x => x.ScheduledAtLocal)
				.MustBePatchFieldIsoDateTime("ScheduledAtLocal");

			this.RuleFor(x => x.Destinations)
				.Custom((destinations, context) => {
					var body = context.InstanceToValidate;
					if (body.AccountIds.ValueKind is not (JsonValueKind.Undefined or JsonValueKind.Null)) {
						context.AddFailure("Send either accountIds or destinations, not both.");
						return;
					}

					if (!RenditionWire.TryParseDestinations(
							destinations, true, out var parsed, out var error)) {
						context.AddFailure(error);
						return;
					}

					var hasDefault = body.ScheduledAtLocal.ValueKind
						is not (JsonValueKind.Undefined or JsonValueKind.Null);
					if (!hasDefault && parsed.Any(item => item.ScheduledAtUtc is null)) {
						context.AddFailure(
							"Every destination needs a scheduledAt, or send a top-level "
							+ "scheduledAtLocal as the default."
						);
					}
				});
		});
	}
}

public record SchedulePostCreatedItem {
	public required Guid Id { get; init; }
	public required Guid SocialAccountId { get; init; }
	public required string Status { get; init; }
}

public record SchedulePostResponse {
	public required Guid PostId { get; init; }
	public required IReadOnlyList<SchedulePostCreatedItem> Publications {
		get; init;
	}
}

public sealed class SchedulePostForTenant {
	public static async Task<Results<
		Created<SchedulePostResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppValidationProblemHttpResult
	>> Handle(
		[FromRoute] string postId,
		[FromBody] SchedulePostBody body,
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

		var result = await publicationService.ScheduleAsync(
			new SchedulePublicationArgs(
				TenantId: tenantId,
				PostId: postIdGuid,
				Destinations: body.GetDestinations(),
				TimeZone: body.GetTimeZone(),
				ActorUserId: account.UserId
			),
			cancellationToken
		);

		return result switch {
			ScheduleResult.NotFound =>
				TypedProblems.NotFound(
					"Post not found",
					ResponseKeys.NotFound
				),
			ScheduleResult.InvalidAccounts invalidAccounts =>
				TypedProblems.ValidationProblem(
					invalidAccounts.Cause,
					invalidAccounts.ErrorKey
						== ScheduleResult.InvalidAccounts.AccountNotInProjectErrorKey
						? ResponseKeys.PublicationScheduleAccountNotInProject
						: ResponseKeys.UnprocessableEntity,
					new Dictionary<string, string[]> {
						["accountIds"] = [invalidAccounts.Cause],
					}
				),
			ScheduleResult.InvalidSchedule invalidSchedule =>
				TypedProblems.ValidationProblem(
					invalidSchedule.Cause,
					ResponseKeys.UnprocessableEntity,
					new Dictionary<string, string[]> {
						[invalidSchedule.ErrorKey] = [invalidSchedule.Cause],
					}
				),
			ScheduleResult.ContentInvalid contentInvalid =>
				PublishContentProblems.ToProblem(contentInvalid.Failure),
			ScheduleResult.OverridesInvalid overridesInvalid =>
				PublishContentProblems.ToProblem(overridesInvalid.Failure),
			ScheduleResult.Scheduled scheduled =>
				TypedResults.Created(
					(string?)null,
					new SchedulePostResponse {
						PostId = postIdGuid,
						Publications = scheduled.Publications
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
				"Unhandled schedule result kind"
			),
		};
	}
}
