using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Users.Entities;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public class GetStaffUserByIdResult {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public string? LastName { get; set; }
	public string? FirstName { get; set; }
	public string? AvatarUrl { get; set; }
	public AccountLevel AccountLevel { get; set; }
	public UserStatus Status { get; set; }
	public DateTime CreatedAt { get; set; }
	public DateTime UpdatedAt { get; set; }
}

public sealed class GetStaffUserById {
	public static async Task<
		Results<
			Ok<GetStaffUserByIdResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult
		>
	> Handle(
		[FromRoute] string userId,
		[FromServices] IStaffUserQueryService UserService,
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
			AccountLevel = user.AccountLevel,
			Status = user.User.Status,
			CreatedAt = user.User.CreatedAt,
			UpdatedAt = user.User.UpdatedAt,
		});
	}
}
