using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib;
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
	// NOTE: This is the "general details" PATCH endpoint for a staff user.
	// High-risk identity operations (email changes) and lifecycle operations (suspend/reactivate)
	// are intentionally handled by dedicated endpoints so they can be permission-gated and audited
	// more explicitly than a generic patch.
	public JsonElement LastName { get; init; }
	public JsonElement FirstName { get; init; }
	public JsonElement AvatarUrl { get; init; }
	public JsonElement? AccountLevel { get; set; }

	public PatchField<string?> GetFirstName() =>
		FirstName.ValueKind switch {
			JsonValueKind.Undefined => PatchField<string?>.Absent(),
			JsonValueKind.Null => PatchField<string?>.Set(null),
			JsonValueKind.String => PatchField<string?>.Set(FirstName.GetValueAsString()),
			_ => throw new InvalidOperationException("FirstName must be a string, null, or omitted"),
		};

	public PatchField<string?> GetLastName() =>
		LastName.ValueKind switch {
			JsonValueKind.Undefined => PatchField<string?>.Absent(),
			JsonValueKind.Null => PatchField<string?>.Set(null),
			JsonValueKind.String => PatchField<string?>.Set(LastName.GetValueAsString()),
			_ => throw new InvalidOperationException("LastName must be a string, null, or omitted"),
		};

	public PatchField<string?> GetAvatarUrl() =>
		AvatarUrl.ValueKind switch {
			JsonValueKind.Undefined => PatchField<string?>.Absent(),
			JsonValueKind.Null => PatchField<string?>.Set(null),
			JsonValueKind.String => PatchField<string?>.Set(AvatarUrl.GetValueAsString()),
			_ => throw new InvalidOperationException("AvatarUrl must be a string, null, or omitted"),
		};

	public string? GetAccountLevel() => AccountLevel?.GetValueAsStringOrNull();
}

public class UpdateStaffUserBodyValidator
	: AbstractValidator<UpdateStaffUserBody> {
	public UpdateStaffUserBodyValidator() {
		RuleFor(x => x.LastName)
			.MustBePatchFieldString("LastName");

		RuleFor(x => x.FirstName)
			.MustBePatchFieldString("FirstName");

		RuleFor(x => x.AvatarUrl)
			.MustBePatchFieldUrl("AvatarUrl");

		RuleFor(x => x.AccountLevel)
			.MustBeNullableAccountLevel();
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
				ResponseKeys.MalformedId
			);
		}

		if (!body.GetFirstName().IsPresent
			&& !body.GetLastName().IsPresent
			&& !body.GetAvatarUrl().IsPresent
			&& body.GetAccountLevel() is null) {
			// PATCH-like endpoint: an empty request means the client sent no work.
			return TypedProblems.BadRequest(
				"No fields to update",
				ResponseKeys.BadRequest
			);
		}

		var updateUserDocument = new UpdateUserDocument {
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
						.GetLevelDescription(
							userData.AccountLevel
						),
				Status = User.GetStatusDescription(
					userData.User.Status
				),
			}
		);
	}
}
