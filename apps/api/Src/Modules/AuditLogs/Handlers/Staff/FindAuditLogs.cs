using System.Globalization;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
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
}

public class FindAuditLogsQueryValidator
	: CursorPaginatedQueryValidator<FindAuditLogsQuery> {
	public FindAuditLogsQueryValidator() {
		RuleFor(x => x.UserId)
			.Must(BeValidNullableGuid)
			.WithMessage(
				"UserId must be a valid GUID"
			);

		RuleFor(x => x.TargetId)
			.Must(BeValidNullableGuid)
			.WithMessage(
				"TargetId must be a valid GUID"
			);

		RuleFor(x => x.StartDate)
			.Must(BeValidNullableDate)
			.WithMessage(
				"StartDate must be a valid ISO 8601 date"
			);

		RuleFor(x => x.EndDate)
			.Must(BeValidNullableDate)
			.WithMessage(
				"EndDate must be a valid ISO 8601 date"
			);

		RuleFor(x => x)
			.Must(HaveValidDateRange)
			.WithMessage(
				"StartDate must be before or equal"
				+ " to EndDate"
			)
			.When(x =>
				x.StartDate is not null
				&& x.EndDate is not null
				&& BeValidNullableDate(x.StartDate)
				&& BeValidNullableDate(x.EndDate)
			);
	}

	private static bool BeValidNullableGuid(
		string? value
	) {
		if (value is null) {
			return true;
		}
		return Guid.TryParse(value, out _);
	}

	private static bool BeValidNullableDate(
		string? value
	) {
		if (value is null) {
			return true;
		}
		return DateTime.TryParse(
			value,
			CultureInfo.InvariantCulture,
			DateTimeStyles.RoundtripKind,
			out _
		);
	}

	private static bool HaveValidDateRange(
		FindAuditLogsQuery query
	) {
		if (query.StartDate is null
			|| query.EndDate is null
		) {
			return true;
		}

		var startParsed = DateTime.TryParse(
			query.StartDate,
			CultureInfo.InvariantCulture,
			DateTimeStyles.RoundtripKind,
			out var start
		);
		var endParsed = DateTime.TryParse(
			query.EndDate,
			CultureInfo.InvariantCulture,
			DateTimeStyles.RoundtripKind,
			out var end
		);

		if (!startParsed || !endParsed) {
			return true;
		}

		return start <= end;
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

		Guid? userId = null;
		if (query.UserId is not null) {
			if (Guid.TryParse(
				query.UserId, out var parsed
			)) {
				userId = parsed;
			}
		}

		Guid? targetId = null;
		if (query.TargetId is not null) {
			if (Guid.TryParse(
				query.TargetId, out var parsed
			)) {
				targetId = parsed;
			}
		}

		DateTime? startDate = null;
		if (query.StartDate is not null) {
			if (DateTime.TryParse(
				query.StartDate,
				CultureInfo.InvariantCulture,
				DateTimeStyles.RoundtripKind,
				out var parsed
			)) {
				startDate = parsed;
			}
		}

		DateTime? endDate = null;
		if (query.EndDate is not null) {
			if (DateTime.TryParse(
				query.EndDate,
				CultureInfo.InvariantCulture,
				DateTimeStyles.RoundtripKind,
				out var parsed
			)) {
				endDate = parsed;
			}
		}

		var serviceResult =
			await auditLogQueryService.FindAsync(
			new FindAuditLogsArgs(
				Cursor: cursorGuid,
				Limit: limit,
				SortId: sortId,
				SortOrder: sortOrder,
				UserId: userId,
				Action: query.Action,
				TargetId: targetId,
				StartDate: startDate,
				EndDate: endDate
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
