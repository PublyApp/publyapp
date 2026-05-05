using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Validation;
using MainApi.Src.Modules.Profiles.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Profiles.Handlers.Staff;

public class FindTenantProfilesAsStaffResult : CursorPaginatedResult<TenantProfileItem> { }

public class FindTenantProfilesAsStaffQuery : CursorPaginatedQuery {
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

public class FindTenantProfilesAsStaffQueryValidator
	: CursorPaginatedQueryValidator<FindTenantProfilesAsStaffQuery> {
	public FindTenantProfilesAsStaffQueryValidator() {
		RuleFor(x => x.Search).MaximumLength(200);
	}
}

public class FindTenantProfilesAsStaff {
	public static async Task<
		Results<
			Ok<FindTenantProfilesAsStaffResult>,
			AppBadRequestHttpResult
		>
	> HandleFindTenantProfilesAsStaff(
		[FromServices] IProfileAsStaffService profileAsStaffService,
		[AsParameters] FindTenantProfilesAsStaffQuery findTenantProfilesAsStaffQuery,
		[FromRoute] string tenantId,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest("Invalid tenant ID", ResponseKeys.MalformedId);
		}

		var cursor = findTenantProfilesAsStaffQuery.GetCursor();
		var cursorGuid = Guid.Empty;

		if (!string.IsNullOrEmpty(cursor)) {
			if (!Guid.TryParse(cursor, out cursorGuid)) {
				return TypedProblems.BadRequest("Invalid cursor", ResponseKeys.BadRequest);
			}
		}

		var limit = findTenantProfilesAsStaffQuery.GetLimit();
		var sortId = findTenantProfilesAsStaffQuery.GetSortId();
		var sortOrder = findTenantProfilesAsStaffQuery.GetSortOrder();

		var args = new FindTenantProfilesArgs(
			TenantId: tenantIdGuid,
			Cursor: cursorGuid,
			Limit: limit,
			SortId: sortId,
			SortOrder: sortOrder,
			Search: findTenantProfilesAsStaffQuery.GetSearchNormalized()
		);

		var serviceResult = await profileAsStaffService.FindTenantProfilesAsync(
			args,
			cancellationToken: cancellationToken
		);

		if (serviceResult is Services.FindTenantProfilesResult.CursorNotFound cursorError) {
			return TypedProblems.BadRequest(
				$"Cursor record not found: {cursorError.Cursor}. The record may have been deleted or the cursor is invalid.",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is Services.FindTenantProfilesResult.InvalidSortId sortIdError) {
			return TypedProblems.BadRequest(
				$"Invalid sortId: {sortIdError.SortId}. Allowed values: id, name, created_at",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is Services.FindTenantProfilesResult.Success success) {
			return TypedResults.Ok(new FindTenantProfilesAsStaffResult {
				Data = success.Data.Data,
				NextCursor = success.Data.NextCursor,
			});
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
