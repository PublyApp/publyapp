using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Profiles.Services;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public class FindTenantProfileUsersAsStaffResult
	: CursorPaginatedResult<TenantProfileMemberItem> { }

public class FindTenantProfileUsersAsStaffQuery : CursorPaginatedQuery {
	[FromQuery(Name = "q")]
	public string? Search { get; set; }

	public string? GetSearchNormalized() {
		if (Search is null) {
			return null;
		}

		// Keep "blank" searches out of the DB query, consistent with the other
		// tenant list endpoints.
		var trimmed = Search.Trim();
		return trimmed.Length == 0 ? null : trimmed;
	}
}

public class FindTenantProfileUsersAsStaffQueryValidator
	: CursorPaginatedQueryValidator<FindTenantProfileUsersAsStaffQuery> {
	public FindTenantProfileUsersAsStaffQueryValidator() {
		RuleFor(x => x.Search)
			.MaximumLength(200)
			.WithMessage("q must be at most 200 characters");
	}
}

public sealed class FindTenantProfileUsersAsStaff {
	public static async Task<
		Results<
			Ok<FindTenantProfileUsersAsStaffResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult
		>
	> Handle(
		[FromRoute] string tenantId,
		[FromRoute] string profileId,
		[AsParameters] FindTenantProfileUsersAsStaffQuery query,
		[FromServices] ITenantProfileQueryAsStaffService tenantProfileService,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenantId",
				ResponseKeys.MalformedId
			);
		}

		if (!Guid.TryParse(profileId, out var profileIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid profileId",
				ResponseKeys.MalformedId
			);
		}

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

		var args = new FindTenantProfileUsersArgs(
			TenantId: tenantIdGuid,
			ProfileId: profileIdGuid,
			Cursor: cursorGuid,
			Limit: query.GetLimit(),
			SortId: query.GetSortId(),
			SortOrder: query.GetSortOrder(),
			Search: query.GetSearchNormalized()
		);

		var serviceResult = await tenantProfileService.FindTenantProfileUsersAsync(
			args,
			cancellationToken
		);

		if (serviceResult is FindTenantProfileUsersResult.ProfileNotFound) {
			return TypedProblems.NotFound(
				"Profile not found",
				ResponseKeys.NotFound
			);
		}

		if (
			serviceResult is FindTenantProfileUsersResult.CursorNotFound cursorError
		) {
			return TypedProblems.BadRequest(
				$"Cursor record not found: {cursorError.Cursor}.",
				ResponseKeys.BadRequest
			);
		}

		if (
			serviceResult is FindTenantProfileUsersResult.InvalidSortId sortIdError
		) {
			return TypedProblems.BadRequest(
				$"Invalid sort_id: {sortIdError.SortId}. "
					+ "Allowed values: id, joined_at, email, level, status.",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is FindTenantProfileUsersResult.Success success) {
			return TypedResults.Ok(
				new FindTenantProfileUsersAsStaffResult {
					Data = success.Data.Data,
					NextCursor = success.Data.NextCursor,
				}
			);
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
