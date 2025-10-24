using MainApi.Src.Features.Common.Account;
using UserNs = MainApi.Src.Features.Common.User;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Features.Staff.StaffMember.Handlers;

public class StaffMemberItem {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public string? LastName { get; set; }
	public string? FirstName { get; set; }
	public string? AvatarUrl { get; set; }
	public string Status { get; set; } = string.Empty;
	public AccountLevel Level { get; set; }
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
			BadRequest<ApiResponse>
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
						Level = staffMember.Level,
					})
					.ToList(),
				Count = count,
			}
		);
	}
}
