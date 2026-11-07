using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Roles.Services;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public class StaffRoleUserItem {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public string? LastName { get; set; }
	public string? FirstName { get; set; }
	public string? AvatarUrl { get; set; }
	public UserStatus Status { get; set; }
}

public class FindStaffRoleUsersResult {
	public required List<StaffRoleUserItem> Users { get; set; }
	public required int Count { get; set; }
}

public class FindStaffRoleUsersQuery : OffsetPaginatedQuery {
	[FromQuery(Name = "q")]
	public string? Search { get; set; }

	public string? GetSearchNormalized() {
		if (this.Search is null) {
			return null;
		}

		// Keep "blank" searches out of the DB query for consistency with other list endpoints.
		var trimmed = this.Search.Trim();
		return trimmed.Length == 0 ? null : trimmed;
	}
}

public class FindStaffRoleUsersQueryValidator
	: OffsetPaginatedQueryValidator<FindStaffRoleUsersQuery> {
	public FindStaffRoleUsersQueryValidator() {
		this.RuleFor(x => x.Search).MaximumLength(200);
	}
}

public sealed class FindStaffRoleUsers {
	public static async Task<
		Results<
			Ok<FindStaffRoleUsersResult>,
			AppNotFoundHttpResult,
			AppBadRequestHttpResult
		>
	> Handle(
		[FromRoute] string roleId,
		[AsParameters] FindStaffRoleUsersQuery query,
		[FromServices] IStaffRoleUserAssignmentAsStaffService staffRoleUserAssignmentAsStaffService,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(roleId, out var roleIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid roleId",
				ResponseKeys.MalformedId
			);
		}

		// NOTE: This uses offset pagination because the existing Role Users tab UI already
		// uses page/limit table state. We can migrate to cursor later if the UX demands it.
		var page = query.GetPage();
		var limit = query.GetLimit();
		var sortId = query.GetSortId();
		var sortOrder = query.GetSortOrder();

		var args = new FindStaffRoleUsersArgs(
			RoleId: roleIdGuid,
			Page: page,
			Limit: limit,
			SortId: sortId,
			SortOrder: sortOrder,
			Search: query.GetSearchNormalized()
		);

		var serviceResult =
			await staffRoleUserAssignmentAsStaffService.FindStaffRoleUsersAsync(
				args: args,
				cancellationToken: cancellationToken
			);

		if (serviceResult is FindStaffRoleUsersServiceResult.RoleNotFound) {
			return TypedProblems.NotFound(
				"Role not found",
				ResponseKeys.NotFound
			);
		}

		if (
			serviceResult is FindStaffRoleUsersServiceResult.InvalidSortId sortIdError
		) {
			return TypedProblems.BadRequest(
				$"Invalid sort_id: {sortIdError.SortId}.",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is FindStaffRoleUsersServiceResult.Success success) {
			return TypedResults.Ok(
				new FindStaffRoleUsersResult {
					Users = success.Users
						.Select(u => new StaffRoleUserItem {
							Id = u.UserId,
							Email = u.Email,
							LastName = u.LastName,
							FirstName = u.FirstName,
							AvatarUrl = u.AvatarUrl,
							Status = u.Status,
						})
						.ToList(),
					Count = success.Count,
				}
			);
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
