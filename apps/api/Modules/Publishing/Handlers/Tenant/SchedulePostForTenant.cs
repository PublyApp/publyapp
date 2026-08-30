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
using PublyApp.Api.Modules.Publishing.Services;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

public record SchedulePostBody {
	public required JsonElement AccountIds { get; init; }
	public required JsonElement ScheduledAtLocal { get; init; }
	public required JsonElement TimeZone { get; init; }

	public List<Guid> GetAccountIds() {
		return AccountIds.EnumerateArray()
			.Select(item => item.GetGuid())
			.ToList();
	}

	public DateTime GetScheduledAtLocal() {
		var raw = ScheduledAtLocal.GetValueAsString();
		if (DateUtils.TryParseIsoUtc(raw, out var utc)) {
			return utc;
		}

		throw new InvalidOperationException(
			"ScheduledAtLocal must be a valid ISO 8601 instant"
		);
	}

	public string GetTimeZone() {
		return TimeZone.GetValueAsString().Trim();
	}
}

public sealed class SchedulePostBodyValidator
	: AbstractValidator<SchedulePostBody> {
	public SchedulePostBodyValidator() {
		RuleFor(x => x.AccountIds)
			.MustBeRequiredGuidArray("AccountIds", "social account ID", 50);

		RuleFor(x => x.ScheduledAtLocal)
			.MustBeRequiredIsoDateTime("ScheduledAtLocal");

		RuleFor(x => x.TimeZone)
			.MustBeRequiredTimezone(
				"TimeZone",
				PublicationSchedule.MaxTimeZoneLength
			);
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
				AccountIds: body.GetAccountIds(),
				ScheduledAtLocal: body.GetScheduledAtLocal(),
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
