using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Validation;
using MainApi.Src.Modules.SystemNotices.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.SystemNotices.Handlers.Staff;

public class FindSystemNoticesResponse
	: CursorPaginatedResult<SystemNoticeListItem> { }

public class FindSystemNoticesQuery : CursorPaginatedQuery { }

public class FindSystemNoticesQueryValidator
	: CursorPaginatedQueryValidator<FindSystemNoticesQuery> { }

public static class FindSystemNotices {
	public static async Task<Results<
		Ok<FindSystemNoticesResponse>,
		AppBadRequestHttpResult
	>> HandleFindSystemNotices(
		[AsParameters] FindSystemNoticesQuery query,
		[FromServices] ISystemNoticeService systemNoticeService,
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

		var serviceResult = await systemNoticeService.FindAsync(
			cursor: cursorGuid,
			limit: limit,
			sortId: sortId,
			sortOrder: sortOrder,
			cancellationToken: cancellationToken
		);

		if (serviceResult
			is FindSystemNoticesResult.CursorNotFound cursorError
		) {
			return TypedProblems.BadRequest(
				$"Cursor record not found: {cursorError.Cursor}. "
				+ "The record may have been deleted "
				+ "or the cursor is invalid.",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult
			is FindSystemNoticesResult.InvalidSortId sortIdError
		) {
			return TypedProblems.BadRequest(
				$"Invalid sortId: {sortIdError.SortId}. "
				+ "Allowed values: created_at, starts_at, severity",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult
			is FindSystemNoticesResult.Success success
		) {
			return TypedResults.Ok(new FindSystemNoticesResponse {
				Data = success.Data.Data,
				NextCursor = success.Data.NextCursor,
			});
		}

		throw new InvalidOperationException(
			"Unhandled result type"
		);
	}
}
