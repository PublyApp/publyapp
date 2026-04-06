using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Users.Entities;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Users.Handlers.Staff;

public class GetStaffUserByIdResult {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public string? LastName { get; set; }
	public string? FirstName { get; set; }
	public string? AvatarUrl { get; set; }
	public string AccountLevel { get; set; } = string.Empty;
	public string Status { get; set; } = string.Empty;
}

public class GetStaffUserById {
	public static async Task<
		Results<
			Ok<GetStaffUserByIdResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult
		>
	> HandleGetStaffUserById(
		[FromRoute] string userId,
		[FromServices] IUserService UserService,
		ILogger<GetStaffUserById> logger,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(userId, out var userIdGuid)) {
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug(
					"Invalid user id: {@LogData}",
					new { UserId = userId }
				);
			}

			return TypedProblems.BadRequest(
				"Invalid user ID",
				ResponseKeys.MalformedId
			);
		}

		var user =
			await UserService.GetStaffUserUserByIdAsync(
				userIdGuid, cancellationToken
			);

		if (user is null) {
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug(
					"User does not exist or is not a staff member: {@LogData}",
					new { UserId = userIdGuid }
				);
			}

			return TypedProblems.NotFound(
				"User not found",
				ResponseKeys.NotFound
			);
		}

		return TypedResults.Ok(new GetStaffUserByIdResult {
			Id = user.User.GetRequiredId(),
			Email = user.User.Email,
			LastName = user.User.LastName,
			FirstName = user.User.FirstName,
			AvatarUrl = user.User.AvatarUrl,
			AccountLevel = UserAccount.GetLevelDescription(user.AccountLevel),
			Status = User.GetStatusDescription(user.User.Status),
		});
	}
}

