using System.Globalization;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Services;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

/// <summary>
/// Query DTO for the queue/calendar list. Deliberately NOT inheriting
/// <see cref="CursorPaginatedQuery"/>: that base advertises <c>sort_id</c> and
/// <c>sort_order</c> on the wire, but this endpoint is a fixed ascending keyset
/// on <c>(scheduled_at, id)</c> (Epic D §4 — queue sorted by instant) whose
/// cursor scheme has no sort dimension. Announcing sort params that the service
/// ignores would be a contract lie, so the contract carries cursor + limit only.
/// </summary>
public class FindScheduledPublicationsQuery {
	[FromQuery(Name = "cursor")]
	public string? Cursor { get; set; }

	[FromQuery(Name = "limit")]
	public string? Limit { get; set; }

	[FromQuery(Name = "from")]
	public string? From { get; set; }

	[FromQuery(Name = "to")]
	public string? To { get; set; }

	[FromQuery(Name = "status")]
	public string? Status { get; set; }

	public string? GetCursor() {
		return Cursor;
	}

	public int? GetLimit() {
		if (Limit is null) {
			return null;
		}

		if (!int.TryParse(Limit, out var limit)) {
			throw new ArgumentException(
				"Limit must be a valid number",
				nameof(Limit)
			);
		}

		return limit;
	}
}

public sealed class FindScheduledPublicationsQueryValidator
	: AbstractValidator<FindScheduledPublicationsQuery> {
	private const string IsoHint = "must be an ISO 8601 instant (e.g. "
		+ "2026-09-01T00:00:00Z)";

	public FindScheduledPublicationsQueryValidator() : base() {
		RuleFor(x => x.From)
			.Must(BeIsoInstant)
			.WithMessage($"from {IsoHint}");

		RuleFor(x => x.To)
			.Must(BeIsoInstant)
			.WithMessage($"to {IsoHint}");

		RuleFor(x => x.Status)
			.Must(BeParseableCsv)
			.WithMessage(
				"status must be a comma-separated list of: scheduled, "
				+ "in_progress, published, failed, paused"
			);

		RuleFor(x => x.Limit)
			.Must(PaginationPredicates.BeValidNullableLimit)
			.WithMessage(
				"limit must be a valid number "
				+ "between 1 and "
				+ AppEnvironment.Instance.PAGINATION_MAX_LIMIT
			);
	}

	private static bool BeIsoInstant(string? value) {
		if (value is null) {
			return false;
		}

		return DateTimeOffset.TryParse(
			value,
			CultureInfo.InvariantCulture,
			DateTimeStyles.AssumeUniversal,
			out _
		);
	}

	private static bool BeParseableCsv(string? value) {
		return FindScheduledPublicationsParser.TryParseStatusCsv(
			value,
			out _
		);
	}
}

/// <summary>
/// Parses the scalar csv `status` query field into publication statuses. Scalar
/// `string?`, never `List<T>?` (OpenAPI/Kiota safeguards).
/// </summary>
public static class FindScheduledPublicationsParser {
	public static bool TryParseStatusCsv(
		string? csv,
		out List<PublicationStatus> statuses
	) {
		statuses = [];
		if (csv is null) {
			return true;
		}

		var trimmed = csv.Trim();
		if (trimmed.Length == 0) {
			return true;
		}

		foreach (var raw in trimmed.Split(',')) {
			var token = raw.Trim().ToLowerInvariant();
			switch (token) {
				case "scheduled":
					statuses.Add(PublicationStatus.Scheduled);
					break;
				case "in_progress":
					statuses.Add(PublicationStatus.InProgress);
					break;
				case "published":
					statuses.Add(PublicationStatus.Published);
					break;
				case "failed":
					statuses.Add(PublicationStatus.Failed);
					break;
				case "paused":
					statuses.Add(PublicationStatus.Paused);
					break;
				default:
					return false;
			}
		}

		return true;
	}
}

public class FindScheduledPublicationsResponse
	: CursorPaginatedResult<ScheduledPublicationItem> { }

public sealed class FindScheduledPublicationsForTenant {
	public static async Task<Results<
		Ok<FindScheduledPublicationsResponse>,
		AppBadRequestHttpResult,
		AppValidationProblemHttpResult
	>> Handle(
		[AsParameters] FindScheduledPublicationsQuery query,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IPublicationService publicationService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException(
				$"{nameof(authContext.TenantId)} is not a GUID"
			);
		}

		var tenantAccount = authContext.AccountTenant;
		if (tenantAccount is null) {
			throw new InvalidOperationException(
				"Tenant account not found in auth context. "
				+ "Ensure the endpoint has "
				+ ".WithTenantPermission(...) middleware."
			);
		}

		if (query.From is null || query.To is null) {
			return TypedProblems.ValidationProblem(
				"'from' and 'to' are required ISO 8601 instants.",
				ResponseKeys.UnprocessableEntity,
				new Dictionary<string, string[]> {
					[query.From is null ? "From" : "To"] = [
						"must be an ISO 8601 instant",
					],
				}
			);
		}

		var fromUtc = DateTimeOffset.Parse(
			query.From,
			CultureInfo.InvariantCulture,
			DateTimeStyles.AssumeUniversal
		).UtcDateTime;
		var toUtc = DateTimeOffset.Parse(
			query.To,
			CultureInfo.InvariantCulture,
			DateTimeStyles.AssumeUniversal
		).UtcDateTime;

		_ = FindScheduledPublicationsParser.TryParseStatusCsv(
			query.Status,
			out var statuses
		);

		var result = await publicationService.FindScheduledAsync(
			new FindScheduledPublicationsArgs(
				TenantId: tenantId,
				FromUtc: fromUtc,
				ToUtc: toUtc,
				Statuses: statuses.Count > 0 ? statuses : null,
				Cursor: query.GetCursor(),
				Limit: query.GetLimit() ?? 50
			),
			cancellationToken
		);

		return result switch {
			FindScheduledResult.InvalidWindow window =>
				TypedProblems.ValidationProblem(
					window.ErrorKey == "publication-window-invalid"
						? "'from' must be earlier than or equal to 'to'."
						: "The requested window spans more than 32 days.",
					ResponseKeys.UnprocessableEntity,
					new Dictionary<string, string[]> {
						[window.ErrorKey] = [
							window.ErrorKey == "publication-window-invalid"
								? "'from' must be earlier than or equal to 'to'."
									: "The requested window spans more than 32 days."
							,
						],
					}
				),
			FindScheduledResult.CursorNotFound =>
				TypedProblems.BadRequest(
					"Unknown cursor: the cursor could not be decoded or does "
						+ "not match any publication in this window.",
					ResponseKeys.BadRequest
				),
			FindScheduledResult.Success success =>
				TypedResults.Ok(new FindScheduledPublicationsResponse {
					Data = success.Page.Data,
					NextCursor = success.Page.NextCursor,
				}),
			_ => throw new InvalidOperationException(
				"Unhandled find-scheduled result kind"
			),
		};
	}
}
