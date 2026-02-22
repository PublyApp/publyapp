using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Validation;
using MainApi.Src.Modules.Profiles.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Profiles.Handlers.Staff;

public class FindStaffProfilesResult : CursorPaginatedResult<StaffProfileItem> { }

public class FindStaffProfilesQuery : CursorPaginatedQuery { }

public class FindStaffProfilesQueryValidator : CursorPaginatedQueryValidator<FindStaffProfilesQuery> { }

public class FindStaffProfiles {
	public static async Task<Results<Ok<FindStaffProfilesResult>, AppBadRequestHttpResult>> HandleFindStaffProfiles(
		[AsParameters] FindStaffProfilesQuery findStaffProfilesQuery,
		[FromServices] IProfileAsStaffService profileAsStaffService,
		CancellationToken cancellationToken
	) {
		var cursor = findStaffProfilesQuery.GetCursor();
		var cursorGuid = Guid.Empty;

		// Support initial page request (null/empty cursor defaults to Guid.Empty)
		if (!string.IsNullOrEmpty(cursor)) {
			if (!Guid.TryParse(cursor, out cursorGuid)) {
				return TypedProblems.BadRequest("Invalid cursor", ResponseKeys.BadRequest);
			}
		}

		var limit = findStaffProfilesQuery.GetLimit();
		var sortId = findStaffProfilesQuery.GetSortId();
		var sortOrder = findStaffProfilesQuery.GetSortOrder();

		var serviceResult = await profileAsStaffService.FindStaffProfilesAsync(
			cursor: cursorGuid,
			limit: limit,
			sortId: sortId,
			sortOrder: sortOrder,
			cancellationToken: cancellationToken
		);

		// Pattern match on discriminated union result using early return pattern
		if (serviceResult is Services.FindStaffProfilesResult.CursorNotFound cursorError) {
			return TypedProblems.BadRequest(
				$"Cursor record not found: {cursorError.Cursor}. The record may have been deleted or the cursor is invalid.",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is Services.FindStaffProfilesResult.InvalidSortId sortIdError) {
			return TypedProblems.BadRequest(
				$"Invalid sortId: {sortIdError.SortId}. Allowed values: id, name, created_at, user_account_count",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is Services.FindStaffProfilesResult.Success success) {
			return TypedResults.Ok(new FindStaffProfilesResult {
				Data = success.Data.Data,
				NextCursor = success.Data.NextCursor,
			});
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
