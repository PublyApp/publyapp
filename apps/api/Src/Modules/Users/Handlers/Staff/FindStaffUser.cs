using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Validation;
using MainApi.Src.Modules.Users.Entities;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Users.Handlers.Staff;

public class StaffUserItem {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public string? LastName { get; set; }
	public string? FirstName { get; set; }
	public string? AvatarUrl { get; set; }
	public string Status { get; set; } = string.Empty;
	public string Level { get; set; } = string.Empty;
}

public class FindStaffUsersResponse : CursorPaginatedResult<StaffUserItem> { }

public class FindStaffUsersQuery : CursorPaginatedQuery {
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

public class FindStaffUsersQueryValidator
	: CursorPaginatedQueryValidator<FindStaffUsersQuery> {
	public FindStaffUsersQueryValidator() {
		RuleFor(x => x.Search).MaximumLength(200);
	}
}

public class FindStaffUsers {
	public static async Task<
		Results<
			Ok<FindStaffUsersResponse>,
			AppBadRequestHttpResult
		>
	> HandleFindStaffUsers(
		[AsParameters] FindStaffUsersQuery findStaffUsersQuery,
		[FromServices] IUserService userService,
		CancellationToken cancellationToken
	) {
		var cursor = findStaffUsersQuery.GetCursor();
		var cursorGuid = Guid.Empty;

		if (!string.IsNullOrEmpty(cursor)) {
			if (!Guid.TryParse(cursor, out cursorGuid)) {
				return TypedProblems.BadRequest(
					"Invalid cursor",
					ResponseKeys.BadRequest
				);
			}
		}

		var limit = findStaffUsersQuery.GetLimit();
		var sortId = findStaffUsersQuery.GetSortId();
		var sortOrder = findStaffUsersQuery.GetSortOrder();
		var search = findStaffUsersQuery.GetSearchNormalized();

		var serviceResult = await userService.FindStaffUsersAsync(
			new FindStaffUsersArgs(
				Cursor: cursorGuid,
				Limit: limit,
				SortId: sortId,
				SortOrder: sortOrder,
				Filters: new FindStaffUsersFilters(
					Search: search
				)
			),
			cancellationToken
		);

		if (serviceResult is FindStaffUsersResult.InvalidSortId sortIdError) {
			return TypedProblems.BadRequest(
				$"Invalid sortId: {sortIdError.SortId}.",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is FindStaffUsersResult.CursorNotFound cursorError) {
			return TypedProblems.BadRequest(
				$"Cursor record not found: {cursorError.Cursor}.",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is FindStaffUsersResult.Success success) {
			return TypedResults.Ok(
				new FindStaffUsersResponse {
					Data = success.Data.Data
						.Select(staffUser => new StaffUserItem {
							Id = staffUser.User.GetRequiredId(),
							Email = staffUser.User.Email,
							LastName = staffUser.User.LastName,
							FirstName = staffUser.User.FirstName,
							AvatarUrl = staffUser.User.AvatarUrl,
							Status = User.GetStatusDescription(staffUser.User.Status),
							Level = UserAccount.GetLevelDescription(staffUser.AccountLevel),
						})
						.ToList(),
					NextCursor = success.Data.NextCursor,
				}
			);
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
