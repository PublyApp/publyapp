using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Validation;
using MainApi.Src.Modules.Users.Entities;
using MainApi.Src.Modules.Users.Services;
using MainApi.Src.Modules.Users.Validation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Users.Handlers.Staff;

public class UpdateStaffUserBody {
	public JsonElement? Email { get; set; }
	public JsonElement? LastName { get; set; }
	public JsonElement? FirstName { get; set; }
	public JsonElement? AvatarUrl { get; set; }
	public JsonElement? AccountLevel { get; set; }
	public JsonElement? Status { get; set; }

	public string? GetEmail() => Email?.GetValueAsStringOrNull();
	public string? GetLastName() => LastName?.GetValueAsStringOrNull();
	public string? GetFirstName() => FirstName?.GetValueAsStringOrNull();
	public string? GetAvatarUrl() => AvatarUrl?.GetValueAsStringOrNull();
	public string? GetAccountLevel() => AccountLevel?.GetValueAsStringOrNull();
	public string? GetStatus() => Status?.GetValueAsStringOrNull();
}

public class UpdateStaffUserBodyValidator
	: AbstractValidator<UpdateStaffUserBody> {
	public UpdateStaffUserBodyValidator() {
		RuleFor(x => x.Email)
			.MustBeNullableEmail();

		RuleFor(x => x.LastName)
			.MustBeNullableNonEmptyString("LastName");

		RuleFor(x => x.FirstName)
			.MustBeNullableNonEmptyString("FirstName");

		RuleFor(x => x.AvatarUrl)
			.MustBeNullableUrl("AvatarUrl");

		RuleFor(x => x.AccountLevel)
			.MustBeNullableAccountLevel();

		RuleFor(x => x.Status)
			.MustBeNullableUserStatus();
	}
}

public class UpdateStaffUser {
	public static async Task<
		Results<
			Ok<GetStaffUserByIdResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult,
			AppInternalServerErrorHttpResult
		>
	> HandleUpdateStaffUser(
		[FromRoute] string userId,
		[FromBody] UpdateStaffUserBody body,
		[FromServices] IUserService UserService,
		ILogger<UpdateStaffUser> logger,
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
				ResponseKeys.BadRequest
			);
		}

		var updateUserDocument = new UpdateUserDocument {
			Email = body.GetEmail(),
			LastName = body.GetLastName(),
			FirstName = body.GetFirstName(),
			AvatarUrl = body.GetAvatarUrl(),
			AccountLevel = body.GetAccountLevel(),
		};

		var result =
			await UserService.UpdateStaffUserByIdAsync(
				userIdGuid,
				updateUserDocument,
				cancellationToken
			);

		if (result is UpdateUserByIdResult.UserNotFound) {
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug(
					"User not found: {@LogData}",
					new { UserId = userIdGuid }
				);
			}

			return TypedProblems.NotFound(
				"User not found",
				ResponseKeys.NotFound
			);
		}

		if (result is UpdateUserByIdResult.UserAccountNotFound) {
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug(
					"User account not found: {@LogData}",
					new { UserId = userIdGuid }
				);
			}

			return TypedProblems.NotFound(
				"User account not found",
				ResponseKeys.NotFound
			);
		}

		if (result is UpdateUserByIdResult.UpdateFailed updateFailed) {
			if (logger.IsEnabled(LogLevel.Error)) {
				logger.LogError("Failed to update staff member: {@LogData}", new { UserId = userIdGuid, ErrorMessage = updateFailed.ErrorMessage });
			}

			return TypedProblems.InternalServerError(
				"Failed to update staff member",
				ResponseKeys.FailedToUpdateStaffUser
			);
		}

		if (result is not UpdateUserByIdResult.Success
			success
		) {
			throw new InvalidOperationException(
				"Unhandled UpdateUserByIdResult type: "
				+ $"{result.GetType().Name}"
			);
		}

		var userData = success.UserData;
		return TypedResults.Ok(
			new GetStaffUserByIdResult {
				Id = userData.User.GetRequiredId(),
				Email = userData.User.Email,
				LastName = userData.User.LastName,
				FirstName = userData.User.FirstName,
				AvatarUrl = userData.User.AvatarUrl,
				AccountLevel =
					UserAccount
						.GetAccountLevelDescription(
							userData.AccountLevel
						),
				Status = User.GetStatusDescription(
					userData.User.Status
				),
			}
		);
	}
}
