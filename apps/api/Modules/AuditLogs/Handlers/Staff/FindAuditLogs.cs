using FluentValidation;

using MainApi.Localization;
using MainApi.Lib;
using MainApi.Lib.ProblemResults;
using MainApi.Lib.Validation;
using MainApi.Modules.AuditLogs.Entities;
using MainApi.Modules.AuditLogs.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Modules.AuditLogs.Handlers.Staff;

public class FindAuditLogsResponse
	: CursorPaginatedResult<AuditLogListItem> { }

public class FindAuditLogsQuery : CursorPaginatedQuery {
	[FromQuery(Name = "user_id")] public string? UserId { get; set; }
	[FromQuery(Name = AuditLogActionsCsv.WireName)]
	public string? Actions { get; set; }
	[FromQuery(Name = "target_id")] public string? TargetId { get; set; }
	[FromQuery(Name = "start_date")] public string? StartDate { get; set; }
	[FromQuery(Name = "end_date")] public string? EndDate { get; set; }

	// CSV-encoded so the property remains primitive - required for
	// [AsParameters] binding and so the OpenAPI generator emits the
	// param (a List<string>? property forces a custom BindAsync,
	// which strips every query param from the OpenAPI doc and from
	// the generated Kiota client URI template).
	public IReadOnlyList<string>? GetActionsList() {
		return AuditLogActionsCsv.Parse(Actions);
	}

	public Guid? GetUserId() {
		return QueryPredicates.ParseNullableGuid(
			UserId
		);
	}

	public Guid? GetTargetId() {
		return QueryPredicates.ParseNullableGuid(
			TargetId
		);
	}

	public DateTime? GetStartDate() {
		return QueryPredicates.ParseNullableDate(
			StartDate
		);
	}

	public DateTime? GetEndDate() {
		return QueryPredicates.ParseNullableDate(
			EndDate
		);
	}
}

public class FindAuditLogsQueryValidator
	: CursorPaginatedQueryValidator<FindAuditLogsQuery> {
	public FindAuditLogsQueryValidator() {
		RuleFor(x => x.UserId)
			.Must(QueryPredicates.BeValidNullableGuid)
			.WithMessage(
				"user_id must be a valid GUID"
			);

		RuleFor(x => x.Actions)
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

		RuleFor(x => x.TargetId)
			.Must(QueryPredicates.BeValidNullableGuid)
			.WithMessage(
				"target_id must be a valid GUID"
			);

		RuleFor(x => x.StartDate)
			.Must(QueryPredicates.BeValidNullableDate)
			.WithMessage(
				"start_date must be a valid ISO 8601 date"
			);

		RuleFor(x => x.EndDate)
			.Must(QueryPredicates.BeValidNullableDate)
			.WithMessage(
				"end_date must be a valid ISO 8601 date"
			);

		RuleFor(x => x)
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
		var actions = Parse(raw);
		if (actions is null) {
			return null;
		}

		foreach (var action in actions) {
			if (action.Length == 0) {
				return "Actions cannot contain empty values.";
			}
		}

		if (actions.Count > 50) {
			return "At most 50 actions can be filtered at once.";
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
				EndDate: query.GetEndDate()
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
				}
			);
		}

		throw new InvalidOperationException(
			"Unhandled result type"
		);
	}
}
