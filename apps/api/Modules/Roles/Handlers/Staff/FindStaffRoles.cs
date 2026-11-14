using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Roles.Services;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public class FindStaffRolesResult : CursorPaginatedResult<StaffRoleItem> {
	public int TotalCount { get; set; }
	public int TotalAssignments { get; set; }
	public StaffRoleListCounts Counts { get; set; } = new();
}

public class StaffRoleListCounts {
	public int Total { get; set; }
	public int System { get; set; }
	public int Custom { get; set; }
}

public class FindStaffRolesQuery : CursorPaginatedQuery {
	[FromQuery(Name = "q")]
	public string? Search { get; set; }

	// "system" (the protected full-access role) or "custom"; omitted = both.
	[FromQuery(Name = "type")]
	public string? Type { get; set; }

	public StaffRoleType? GetTypeOrNull() {
		var raw = this.Type?.Trim();
		if (string.Equals(raw, "system", StringComparison.OrdinalIgnoreCase)) {
			return StaffRoleType.System;
		}

		return string.Equals(raw, "custom", StringComparison.OrdinalIgnoreCase)
			? StaffRoleType.Custom
			: null;
	}

	public string? GetSearchNormalized() {
		if (this.Search is null) {
			return null;
		}

		var trimmed = this.Search.Trim();
		return trimmed.Length == 0 ? null : trimmed;
	}
}

public class FindStaffRolesQueryValidator : CursorPaginatedQueryValidator<FindStaffRolesQuery> {
	public FindStaffRolesQueryValidator() {
		this.RuleFor(x => x.Search).MaximumLength(200);
		this.RuleFor(x => x.Type)
			.Must(raw => string.IsNullOrEmpty(raw)
				|| string.Equals(raw.Trim(), "system", StringComparison.OrdinalIgnoreCase)
				|| string.Equals(raw.Trim(), "custom", StringComparison.OrdinalIgnoreCase))
			.WithMessage("Invalid type. Must be one of: system,custom");
	}
}

public sealed class FindStaffRoles {
	public static async Task<Results<Ok<FindStaffRolesResult>, AppBadRequestHttpResult>> Handle(
		[AsParameters] FindStaffRolesQuery findStaffRolesQuery,
		[FromServices] IStaffRoleQueryAsStaffService roleQueryAsStaffService,
		CancellationToken cancellationToken
	) {
		var cursor = findStaffRolesQuery.GetCursor();
		var cursorGuid = Guid.Empty;

		// Support initial page request (null/empty cursor defaults to Guid.Empty)
		if (!string.IsNullOrEmpty(cursor)) {
			if (!Guid.TryParse(cursor, out cursorGuid)) {
				return TypedProblems.BadRequest("Invalid cursor", ResponseKeys.BadRequest);
			}
		}

		var limit = findStaffRolesQuery.GetLimit();
		var sortId = findStaffRolesQuery.GetSortId();
		var sortOrder = findStaffRolesQuery.GetSortOrder();

		var args = new FindStaffRolesArgs(
			Cursor: cursorGuid,
			Limit: limit,
			SortId: sortId,
			SortOrder: sortOrder,
			Search: findStaffRolesQuery.GetSearchNormalized(),
			Type: findStaffRolesQuery.GetTypeOrNull()
		);

		var serviceResult = await roleQueryAsStaffService.FindStaffRolesAsync(
			args,
			cancellationToken: cancellationToken
		);

		// Pattern match on discriminated union result using early return pattern
		if (serviceResult is Services.FindStaffRolesResult.CursorNotFound cursorError) {
			return TypedProblems.BadRequest(
				$"Cursor record not found: {cursorError.Cursor}. The record may have been deleted or the cursor is invalid.",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is Services.FindStaffRolesResult.InvalidSortId sortIdError) {
			return TypedProblems.BadRequest(
				$"Invalid sort_id: {sortIdError.SortId}. Allowed values: id, name, created_at, user_account_count",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is Services.FindStaffRolesResult.Success success) {
			return TypedResults.Ok(new FindStaffRolesResult {
				Data = success.Data.Data,
				NextCursor = success.Data.NextCursor,
				TotalCount = success.TotalCount,
				TotalAssignments = success.TotalAssignments,
				Counts = new StaffRoleListCounts {
					Total = success.Counts.Total,
					System = success.Counts.System,
					Custom = success.Counts.Custom,
				},
			});
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
