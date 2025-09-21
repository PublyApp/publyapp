using MainApi.Localization;
using MainApi.Src.Features.Common.Account;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Features.Staff.StaffMember.Handlers.GetStaffMemberById;

public class GetStaffMemberByIdResult {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public string? LastName { get; set; }
	public string? FirstName { get; set; }
	public string? AvatarUrl { get; set; }
}

public class GetStaffMemberById {
	public static async Task<
		Results<
			Ok<GetStaffMemberByIdResult>,
			BadRequest<ApiResponse>
		>
	> HandleGetStaffMemberById(
		[FromRoute] string userId,
		[FromServices] IAccountService accountService,
		ILogger<GetStaffMemberById> logger,
		CancellationToken cancellationToken = default
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
		var user = await accountService.GetStaffMemberUserByIdAsync(userIdGuid, cancellationToken);

		if (user is null) {
			logger.LogDebug("User does not exist or is not a staff member: {@LogData}", new { UserId = userIdGuid });

			return TypedResults.BadRequest(ApiResponse.Create(
				"User does not exist or is not a staff member",
				ResponseKeys.UserNotFound
			));
		}

		return TypedResults.Ok(new GetStaffMemberByIdResult {
			Id = user.Id,
			Email = user.Email,
			LastName = user.LastName,
			FirstName = user.FirstName,
			AvatarUrl = user.AvatarUrl
		});
	}
}
