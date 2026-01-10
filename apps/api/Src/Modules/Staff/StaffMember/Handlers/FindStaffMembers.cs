using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Shared.Users;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using UserNs = MainApi.Src.Modules.Shared.Users;

namespace MainApi.Src.Modules.Staff.StaffMember.Handlers;

public class StaffMemberItem {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public string? LastName { get; set; }
	public string? FirstName { get; set; }
	public string? AvatarUrl { get; set; }
	public string Status { get; set; } = string.Empty;
	public string Level { get; set; } = string.Empty;
}

public class FindStaffMembersResult {
	public required List<StaffMemberItem> StaffMembers { get; set; }
	public required int Count { get; set; }
}

public class FindStaffMembersQuery : PaginatedQuery { }

public class FindStaffMembersQueryValidator : PaginatedQueryValidator<FindStaffMembersQuery> { }

public class FindStaffMembers {
	public static async Task<
		Results<
			Ok<FindStaffMembersResult>,
			AppBadRequestHttpResult
		>
	> HandleFindStaffMembers(
		[AsParameters] FindStaffMembersQuery findStaffMembersQuery,
		[FromServices] IStaffMemberService staffMemberService,
		CancellationToken cancellationToken
	) {
		var page = findStaffMembersQuery.GetPage();
		var limit = findStaffMembersQuery.GetLimit();
		var sortId = findStaffMembersQuery.GetSortId();
		var sortOrder = findStaffMembersQuery.GetSortOrder();

		var count = await staffMemberService.CountStaffMembersAsync(cancellationToken);

		var staffMembers = await staffMemberService.FindStaffMembersAsync(
			page: page,
			limit: limit,
			sortId: sortId,
			sortOrder: sortOrder,
			cancellationToken: cancellationToken
		);

		return TypedResults.Ok(
			new FindStaffMembersResult {
				StaffMembers = staffMembers
					.Select(staffMember => new StaffMemberItem {
						Id = staffMember.User.GetRequiredId(),
						Email = staffMember.User.Email,
						LastName = staffMember.User.LastName,
						FirstName = staffMember.User.FirstName,
						AvatarUrl = staffMember.User.AvatarUrl,
						Status = UserNs.User.GetStatusDescription(staffMember.User.Status),
						Level = UserAccount.GetAccountLevelDescription(staffMember.AccountLevel),
					})
					.ToList(),
				Count = count,
			}
		);
	}
}
