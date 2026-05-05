using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Validation;
using MainApi.Src.Modules.AuditLogs.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.AuditLogs.Handlers.Staff;

public class FindAuditLogsResponse
	: CursorPaginatedResult<AuditLogListItem> { }

public class FindAuditLogsQuery : CursorPaginatedQuery {
	[FromQuery] public string? UserId { get; set; }
	[FromQuery] public string? Action { get; set; }
	[FromQuery] public string? TargetId { get; set; }
	[FromQuery] public string? StartDate { get; set; }
	[FromQuery] public string? EndDate { get; set; }

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
				"UserId must be a valid GUID"
			);

		RuleFor(x => x.TargetId)
			.Must(QueryPredicates.BeValidNullableGuid)
			.WithMessage(
				"TargetId must be a valid GUID"
			);

		RuleFor(x => x.StartDate)
			.Must(QueryPredicates.BeValidNullableDate)
			.WithMessage(
				"StartDate must be a valid ISO 8601 date"
			);

		RuleFor(x => x.EndDate)
			.Must(QueryPredicates.BeValidNullableDate)
			.WithMessage(
				"EndDate must be a valid ISO 8601 date"
			);

		RuleFor(x => x)
			.Must(q => QueryPredicates.BeValidDateRange(
				q.StartDate, q.EndDate
			))
			.WithMessage(
				"StartDate must be before or equal"
				+ " to EndDate"
			)
			.When(x =>
				x.StartDate is not null
				&& x.EndDate is not null
				&& QueryPredicates.BeValidNullableDate(
					x.StartDate
				)
				&& QueryPredicates.BeValidNullableDate(
					x.EndDate
				)
			);
	}
}

public static class FindAuditLogs {
	public static async Task<Results<
		Ok<FindAuditLogsResponse>,
		AppBadRequestHttpResult
	>> HandleFindAuditLogs(
		[AsParameters] FindAuditLogsQuery query,
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
				Action: query.Action,
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
				"Invalid sortId: "
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
