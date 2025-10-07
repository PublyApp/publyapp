using MainApi.Src.Features.Common.User;
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
	public UserStatus Status { get; set; } = UserStatus.Inactive;
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

		var countTask = staffMemberService.CountStaffMembersAsync(cancellationToken);

		var staffMembersTask = staffMemberService.FindStaffMembersAsync(
			page: page,
			limit: limit,
			sortId: sortId,
			sortOrder: sortOrder,
			cancellationToken: cancellationToken
		);

		await Task.WhenAll(countTask, staffMembersTask).ConfigureAwait(false);

		var count = await countTask;
		var staffMembers = await staffMembersTask;

		return TypedResults.Ok(
			new FindStaffMembersResult {
				StaffMembers = staffMembers
					.Select(staffMember => new StaffMemberItem {
						Id = staffMember.Id,
						Email = staffMember.Email,
					})
					.ToList(),
				Count = count,
			}
		);
	}
}
