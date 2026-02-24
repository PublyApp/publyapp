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

public class FindStaffUsersResult {
	public required List<StaffUserItem> StaffUsers { get; set; }
	public required int Count { get; set; }
}

public class FindStaffUsersQuery : PaginatedQuery { }

public class FindStaffUsersQueryValidator : OffsetPaginatedQueryValidator<FindStaffUsersQuery> { }

public class FindStaffUsers {
	public static async Task<
		Results<
			Ok<FindStaffUsersResult>,
			AppBadRequestHttpResult
		>
	> HandleFindStaffUsers(
		[AsParameters] FindStaffUsersQuery findStaffUsersQuery,
		[FromServices] IUserService UserService,
		CancellationToken cancellationToken
	) {
		var page = findStaffUsersQuery.GetPage();
		var limit = findStaffUsersQuery.GetLimit();
		var sortId = findStaffUsersQuery.GetSortId();
		var sortOrder = findStaffUsersQuery.GetSortOrder();

		var count = await UserService.CountStaffUsersAsync(cancellationToken);

		var staffUsers = await UserService.FindStaffUsersAsync(
			page: page,
			limit: limit,
			sortId: sortId,
			sortOrder: sortOrder,
			cancellationToken: cancellationToken
		);

		return TypedResults.Ok(
			new FindStaffUsersResult {
				StaffUsers = staffUsers
					.Select(staffUser => new StaffUserItem {
						Id = staffUser.User.GetRequiredId(),
						Email = staffUser.User.Email,
						LastName = staffUser.User.LastName,
						FirstName = staffUser.User.FirstName,
						AvatarUrl = staffUser.User.AvatarUrl,
						Status = User.GetStatusDescription(staffUser.User.Status),
						Level = UserAccount.GetAccountLevelDescription(staffUser.AccountLevel),
					})
					.ToList(),
				Count = count,
			}
		);
	}
}

