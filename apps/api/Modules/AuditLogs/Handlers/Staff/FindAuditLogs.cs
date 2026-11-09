using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;

namespace PublyApp.Api.Modules.AuditLogs.Handlers.Staff;

public class AuditLogActionCountItem {
	public string Action { get; set; } = string.Empty;
	public int Count { get; set; }
}

public class AuditLogActorCountItem {
	public Guid? UserId { get; set; }
	public string Name { get; set; } = string.Empty;
	public int Count { get; set; }
}

public class AuditLogListCounts {
	public int Today { get; set; }
	public int Last30Days { get; set; }
	public List<AuditLogActionCountItem> ByAction { get; set; } = [];
	public List<AuditLogActorCountItem> ByActor { get; set; } = [];
}

public class FindAuditLogsResponse
	: CursorPaginatedResult<AuditLogListItem> {
	public int TotalCount { get; set; }
	public AuditLogListCounts Counts { get; set; } = new();
}

public class FindAuditLogsQuery : CursorPaginatedQuery {
	[FromQuery(Name = "user_id")] public string? UserId { get; set; }
	[FromQuery(Name = AuditLogActionsCsv.WireName)]
	public string? Actions { get; set; }
	[FromQuery(Name = "target_id")] public string? TargetId { get; set; }
	[FromQuery(Name = "start_date")] public string? StartDate { get; set; }
	[FromQuery(Name = "end_date")] public string? EndDate { get; set; }
	[FromQuery(Name = "q")] public string? Search { get; set; }
	/// <summary>Narrows to the events that have no actor (an unknown-account
	/// sign-in attempt): the « (unknown) » actor facet.</summary>
	[FromQuery(Name = "unknown_actor")] public string? UnknownActor { get; set; }

	// CSV-encoded so the property remains primitive - required for
	// [AsParameters] binding and so the OpenAPI generator emits the
	// param (a List<string>? property forces a custom BindAsync,
	// which strips every query param from the OpenAPI doc and from
	// the generated Kiota client URI template).
	public IReadOnlyList<string>? GetActionsList() {
		return AuditLogActionsCsv.Parse(this.Actions);
	}

	public Guid? GetUserId() {
		return QueryPredicates.ParseNullableGuid(
			this.UserId
		);
	}

	public Guid? GetTargetId() {
		return QueryPredicates.ParseNullableGuid(
			this.TargetId
		);
	}

	public DateTime? GetStartDate() {
		return QueryPredicates.ParseNullableDate(
			this.StartDate
		);
	}

	public DateTime? GetEndDate() {
		return QueryPredicates.ParseNullableDate(
			this.EndDate
		);
	}

	public string? GetSearchNormalized() {
		if (this.Search is null) {
			return null;
		}

		var trimmed = this.Search.Trim();
		return trimmed.Length == 0 ? null : trimmed;
	}

	public bool? GetUnknownActor() {
		return QueryPredicates.ParseNullableBoolean(this.UnknownActor);
	}
}

public class FindAuditLogsQueryValidator
	: CursorPaginatedQueryValidator<FindAuditLogsQuery> {
	public FindAuditLogsQueryValidator() {
		this.RuleFor(x => x.UserId)
			.Must(QueryPredicates.BeValidNullableGuid)
			.WithMessage(
				"user_id must be a valid GUID"
			);

		this.RuleFor(x => x.Actions)
			.Custom((raw, context) => {
				var error =
					AuditLogActionsCsv.GetValidationError(raw);
				if (error is not null) {
					context.AddFailure(
						AuditLogActionsCsv.WireName,
						error
					);
				}
			});

		this.RuleFor(x => x.Search).MaximumLength(200);

		this.RuleFor(x => x.UnknownActor)
			.Must(QueryPredicates.BeValidNullableBoolean)
			.WithMessage(
				"unknown_actor must be 'true' or 'false'"
			);

		this.RuleFor(x => x.TargetId)
			.Must(QueryPredicates.BeValidNullableGuid)
			.WithMessage(
				"target_id must be a valid GUID"
			);

		this.RuleFor(x => x.StartDate)
			.Must(QueryPredicates.BeValidNullableDate)
			.WithMessage(
				"start_date must be a valid ISO 8601 date"
			);

		this.RuleFor(x => x.EndDate)
			.Must(QueryPredicates.BeValidNullableDate)
			.WithMessage(
				"end_date must be a valid ISO 8601 date"
			);

		this.RuleFor(x => x)
			.Custom((query, context) => {
				if (query.StartDate is null
					|| query.EndDate is null
					|| !QueryPredicates.BeValidNullableDate(
						query.StartDate
					)
					|| !QueryPredicates.BeValidNullableDate(
						query.EndDate
					)
					|| QueryPredicates.BeValidDateRange(
						query.StartDate,
						query.EndDate
					)
				) {
					return;
				}

				context.AddFailure(
					"start_date",
					"start_date must be before or equal"
					+ " to end_date"
				);
			});
	}
}

internal static class AuditLogActionsCsv {
	public const string WireName = "actions";

	// Shared by list and export query DTOs; keep parsing and
	// validation here so both endpoints expose the same actions
	// CSV contract.
	public static IReadOnlyList<string>? Parse(
		string? raw
	) {
		if (string.IsNullOrWhiteSpace(raw)) {
			return null;
		}

		// Do not remove empty entries here; validators must
		// reject actions=a,,b instead of silently accepting it.
		return raw.Split(
			',',
			StringSplitOptions.TrimEntries
		);
	}

	public static string? GetValidationError(
		string? raw
	) {
		var actions = AuditLogActionsCsv.Parse(raw);
		if (actions is null) {
			return null;
		}

		foreach (var action in actions) {
			if (action.Length == 0) {
				return "Actions cannot contain empty values.";
			}
		}

		// The redesigned audit log filters by history category, so one request
		// may legitimately list every action of several categories. The bound is
		// the registry's own size (a request cannot name more distinct valid
		// actions than exist), not a fixed 50 that a real category selection
		// already exceeds (#2286).
		if (actions.Count > AuditActionsRegistry.All.Count) {
			return "At most "
				+ AuditActionsRegistry.All.Count
				+ " actions can be filtered at once.";
		}

		foreach (var action in actions) {
			if (!AuditActionsRegistry.IsKnown(action)) {
				return $"'{action}' is not a valid audit action.";
			}
		}

		return null;
	}
}

public sealed class FindAuditLogs {
	public static async Task<Results<
		Ok<FindAuditLogsResponse>,
		AppBadRequestHttpResult
	>> Handle(
		[AsParameters]
		FindAuditLogsQuery query,
		[FromServices]
		IAuditLogQueryService auditLogQueryService,
		CancellationToken cancellationToken = default
	) {
		var cursor = query.GetCursor();
		var cursorGuid = Guid.Empty;

		if (!string.IsNullOrEmpty(cursor)) {
			if (!Guid.TryParse(cursor, out cursorGuid)) {
				return TypedProblems.BadRequest(
					"Invalid cursor",
					ResponseKeys.BadRequest
				);
			}
		}

		var limit = query.GetLimit();
		var sortId = query.GetSortId();
		var sortOrder = query.GetSortOrder();

		var serviceResult =
			await auditLogQueryService.FindAsync(
			new FindAuditLogsArgs(
				Cursor: cursorGuid,
				Limit: limit,
				SortId: sortId,
				SortOrder: sortOrder,
				UserId: query.GetUserId(),
				Actions: query.GetActionsList(),
				TargetId: query.GetTargetId(),
				StartDate: query.GetStartDate(),
				EndDate: query.GetEndDate(),
				Search: query.GetSearchNormalized(),
				UnknownActor: query.GetUnknownActor()
			),
			cancellationToken
		);

		if (serviceResult
			is FindAuditLogsResult.CursorNotFound
				cursorError
		) {
			return TypedProblems.BadRequest(
				"Cursor record not found: "
				+ $"{cursorError.Cursor}. "
				+ "The record may have been deleted "
				+ "or the cursor is invalid.",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult
			is FindAuditLogsResult.InvalidSortId
				sortIdError
		) {
			return TypedProblems.BadRequest(
				"Invalid sort_id: "
				+ $"{sortIdError.SortId}. "
				+ "Allowed values: created_at",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult
			is FindAuditLogsResult.Success success
		) {
			return TypedResults.Ok(
				new FindAuditLogsResponse {
					Data = success.Data.Data,
					NextCursor =
						success.Data.NextCursor,
					TotalCount = success.TotalCount,
					Counts = new AuditLogListCounts {
						Today = success.Counts.Today,
						Last30Days = success.Counts.Last30Days,
						ByAction = success.Counts.ByAction
							.Select(count => new AuditLogActionCountItem {
								Action = count.Action,
								Count = count.Count,
							})
							.ToList(),
						ByActor = success.Counts.ByActor
							.Select(count => new AuditLogActorCountItem {
								UserId = count.UserId,
								Name = count.Name,
								Count = count.Count,
							})
							.ToList(),
					},
				}
			);
		}

		throw new InvalidOperationException(
			"Unhandled result type"
		);
	}
}
