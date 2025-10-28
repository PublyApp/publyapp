using System.Text.Json;
using MainApi.Localization;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Features.Staff.StaffMember.Handlers;

public class UpdateStaffMemberBody {
	// public JsonElement? UserId { get; set; }
	public JsonElement? Email { get; set; }
	public JsonElement? LastName { get; set; }
	public JsonElement? FirstName { get; set; }
	public JsonElement? AvatarUrl { get; set; }
	public JsonElement? AccountLevel { get; set; }

	public string? GetEmail() {
		return Email?.GetValueAsStringOrNull();
	}

	public string? GetLastName() {
		return LastName?.GetValueAsStringOrNull();
	}

	public string? GetFirstName() {
		return FirstName?.GetValueAsStringOrNull();
	}

	public string? GetAvatarUrl() {
		return AvatarUrl?.GetValueAsStringOrNull();
	}

	public string? GetAccountLevel() {
		return AccountLevel?.GetValueAsStringOrNull();
	}

	// public Guid GetUserId() {
	// 	return UserId.GetValueAsGuid();
	// }
}

public class UpdateStaffMemberResult {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public string LastName { get; set; } = string.Empty;
	public string FirstName { get; set; } = string.Empty;
	public string AvatarUrl { get; set; } = string.Empty;
	public string AccountLevel { get; set; } = string.Empty;
}

public class UpdateStaffMember {
	public static async Task<
		Results<
			Ok<ApiResponse>,
			BadRequest<ApiResponse>,
			InternalServerError<ApiResponse>
		>
	> HandleUpdateStaffMember(
		[FromRoute] string userId,
		[FromBody] UpdateStaffMemberBody body,
		[FromServices] IStaffMemberService staffMemberService,
		[FromServices] IUserService userService,
		ILogger<UpdateStaffMember> logger,
		CancellationToken cancellationToken
	) {
		// var userId = body.GetUserId();
		// var email = body.GetEmail();
		// var lastName = body.GetLastName();
		// var firstName = body.GetFirstName();
		// var avatarUrl = body.GetAvatarUrl();
		// var accountLevel = body.GetAccountLevel();
		var parseResult = Guid.TryParse(userId, out var userIdGuid);

		if (!parseResult) {
			logger.LogDebug("Invalid user id: {@LogData}", new { UserId = userId });

			return TypedResults.BadRequest(ApiResponse.Create(
				"User does not exist or is not a staff member",
				ResponseKeys.UserNotFound
			));
		}

		var updateUserDocument = new UpdateUserDocument {
			Email = body.GetEmail(),
			LastName = body.GetLastName(),
			FirstName = body.GetFirstName(),
			AvatarUrl = body.GetAvatarUrl(),
			AccountLevel = body.GetAccountLevel(),
		};

		var result = await staffMemberService.UpdateStaffMemberByIdAsync(userIdGuid, updateUserDocument, cancellationToken);

		if (result is UpdateUserByIdResult.UserNotFound) {
			logger.LogDebug("User not found: {@LogData}", new { UserId = userIdGuid });

			return TypedResults.BadRequest(ApiResponse.Create(
				"User does not exist or is not a staff member",
				ResponseKeys.UserNotFound
			));
		}

		if (result is UpdateUserByIdResult.UserAccountNotFound) {
			logger.LogDebug("User account not found: {@LogData}", new { UserId = userIdGuid });

			return TypedResults.BadRequest(ApiResponse.Create(
				"User account does not exist or is not a staff member",
				ResponseKeys.UserNotFound
			));
		}

		if (result is UpdateUserByIdResult.MultipleStaffAccountsFound) {
			logger.LogWarning("Multiple staff accounts found: {@LogData}", new { UserId = userIdGuid });

			return TypedResults.BadRequest(ApiResponse.Create(
				"Multiple staff accounts found",
				ResponseKeys.MultipleStaffAccountsFound
			));
		}

		if (result is UpdateUserByIdResult.UpdateFailed updateFailed) {
			logger.LogError("Failed to update staff member: {@LogData}", new { UserId = userIdGuid, ErrorMessage = updateFailed.ErrorMessage });

			return TypedResults.InternalServerError(ApiResponse.Create(
				"Failed to update staff member",
				ResponseKeys.FailedToUpdateStaffMember
			));
		}

		return TypedResults.Ok(ApiResponse.Create("Staff member updated successfully", ResponseKeys.StaffMemberUpdatedSuccessfully));
	}
}
