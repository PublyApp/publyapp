using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Modules.Shared.Users;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Staff.StaffMember.Handlers;

public class GetStaffMemberByIdResult {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public string? LastName { get; set; }
	public string? FirstName { get; set; }
	public string? AvatarUrl { get; set; }
	public string AccountLevel { get; set; } = string.Empty;
	public string Status { get; set; } = string.Empty;
}

public class GetStaffMemberById {
	public static async Task<
		Results<
			Ok<GetStaffMemberByIdResult>,
			BadRequest<ApiResponse>
		>
	> HandleGetStaffMemberById(
		[FromRoute] string userId,
		[FromServices] IStaffMemberService staffMemberService,
		ILogger<GetStaffMemberById> logger,
		CancellationToken cancellationToken
	) {
		var isUserIdGuid = Guid.TryParse(userId, out var userIdGuid);

		if (!isUserIdGuid) {
			logger.LogDebug("Invalid user id: {@LogData}", new { UserId = userId });

			return TypedResults.BadRequest(ApiResponse.Create(
				"User does not exist or is not a staff member",
				ResponseKeys.UserNotFound
			));
		}

		// Get the staff member user by ID using the account service
		var user = await staffMemberService.GetStaffMemberUserByIdAsync(userIdGuid, cancellationToken);

		if (user is null) {
			logger.LogDebug("User does not exist or is not a staff member: {@LogData}", new { UserId = userIdGuid });

			return TypedResults.BadRequest(ApiResponse.Create(
				"User does not exist or is not a staff member",
				ResponseKeys.UserNotFound
			));
		}

		return TypedResults.Ok(new GetStaffMemberByIdResult {
			Id = user.User.GetRequiredId(),
			Email = user.User.Email,
			LastName = user.User.LastName,
			FirstName = user.User.FirstName,
			AvatarUrl = user.User.AvatarUrl,
			AccountLevel = UserAccount.GetAccountLevelDescription(user.AccountLevel),
			Status = User.GetStatusDescription(user.User.Status),
		});
	}
}
