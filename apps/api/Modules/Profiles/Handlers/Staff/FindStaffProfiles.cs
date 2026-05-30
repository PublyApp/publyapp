using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Profiles.Services;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public class FindStaffProfilesResult : CursorPaginatedResult<StaffProfileItem> { }

public class FindStaffProfilesQuery : CursorPaginatedQuery {
	[FromQuery(Name = "q")]
	public string? Search { get; set; }

	public string? GetSearchNormalized() {
		if (Search is null) {
			return null;
		}

		var trimmed = Search.Trim();
		return trimmed.Length == 0 ? null : trimmed;
	}
}

public class FindStaffProfilesQueryValidator : CursorPaginatedQueryValidator<FindStaffProfilesQuery> {
	public FindStaffProfilesQueryValidator() {
		RuleFor(x => x.Search).MaximumLength(200);
	}
}

public sealed class FindStaffProfiles {
	public static async Task<Results<Ok<FindStaffProfilesResult>, AppBadRequestHttpResult>> Handle(
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

		var args = new FindStaffProfilesArgs(
			Cursor: cursorGuid,
			Limit: limit,
			SortId: sortId,
			SortOrder: sortOrder,
			Search: findStaffProfilesQuery.GetSearchNormalized()
		);

		var serviceResult = await profileAsStaffService.FindStaffProfilesAsync(
			args,
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
				$"Invalid sort_id: {sortIdError.SortId}. Allowed values: id, name, created_at, user_account_count",
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
