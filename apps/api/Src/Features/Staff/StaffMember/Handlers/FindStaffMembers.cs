using MainApi.Src.Data.DbContext;
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

public class FindStaffMembers {
	public static async Task<
		Results<
			Ok<FindStaffMembersResult>,
			BadRequest<ApiResponse>
		>
	> HandleFindStaffMembers(
		[FromServices] MainApiDbContext dbContext,
		CancellationToken cancellationToken = default
	) {
		await Task.Delay(1000, cancellationToken);

		return TypedResults.Ok(new FindStaffMembersResult {
			StaffMembers = [
				new StaffMemberItem {
					Id = Guid.NewGuid(),
					Email = "test@test.com",
					LastName = "Test",
					FirstName = "Test",
					AvatarUrl = "https://via.placeholder.com/150",
					Status = UserStatus.Active,
				},
			],
			Count = 1,
		});
	}
}
