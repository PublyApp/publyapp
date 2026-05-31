using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Users.Entities;
using PublyApp.Api.Modules.Users.Services;
using PublyApp.Api.Modules.Users.Validation;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public class UpdateStaffUserBody {
	// NOTE: This is the "general details" PATCH endpoint for a staff user.
	// High-risk identity operations (email changes) and lifecycle operations (suspend/reactivate)
	// are intentionally handled by dedicated endpoints so they can be permission-gated and audited
	// more explicitly than a generic patch.
	public JsonElement LastName { get; init; }
	public JsonElement FirstName { get; init; }
	public JsonElement AvatarUrl { get; init; }
	public JsonElement? AccountLevel { get; set; }

	public PatchField<string?> GetFirstName() {
		return FirstName.ValueKind switch {
			JsonValueKind.Undefined => PatchField<string?>.Absent(),
			JsonValueKind.Null => PatchField<string?>.Set(null),
			JsonValueKind.String => PatchField<string?>.Set(FirstName.GetValueAsString()),
			JsonValueKind.Object
				or JsonValueKind.Array
				or JsonValueKind.Number
				or JsonValueKind.True
				or JsonValueKind.False => throw new InvalidOperationException(
					"FirstName must be a string, null, or omitted"
				),
			_ => throw new ArgumentOutOfRangeException(
				nameof(FirstName),
				FirstName.ValueKind,
				$"Unhandled JsonValueKind: {FirstName.ValueKind}"
			),
		};
	}

	public PatchField<string?> GetLastName() {
		return LastName.ValueKind switch {
			JsonValueKind.Undefined => PatchField<string?>.Absent(),
			JsonValueKind.Null => PatchField<string?>.Set(null),
			JsonValueKind.String => PatchField<string?>.Set(LastName.GetValueAsString()),
			JsonValueKind.Object
				or JsonValueKind.Array
				or JsonValueKind.Number
				or JsonValueKind.True
				or JsonValueKind.False => throw new InvalidOperationException(
					"LastName must be a string, null, or omitted"
				),
			_ => throw new ArgumentOutOfRangeException(
				nameof(LastName),
				LastName.ValueKind,
				$"Unhandled JsonValueKind: {LastName.ValueKind}"
			),
		};
	}

	public PatchField<string?> GetAvatarUrl() {
		return AvatarUrl.ValueKind switch {
			JsonValueKind.Undefined => PatchField<string?>.Absent(),
			JsonValueKind.Null => PatchField<string?>.Set(null),
			JsonValueKind.String => PatchField<string?>.Set(AvatarUrl.GetValueAsString()),
			JsonValueKind.Object
				or JsonValueKind.Array
				or JsonValueKind.Number
				or JsonValueKind.True
				or JsonValueKind.False => throw new InvalidOperationException(
					"AvatarUrl must be a string, null, or omitted"
				),
			_ => throw new ArgumentOutOfRangeException(
				nameof(AvatarUrl),
				AvatarUrl.ValueKind,
				$"Unhandled JsonValueKind: {AvatarUrl.ValueKind}"
			),
		};
	}

	public string? GetAccountLevel() {
		return AccountLevel?.GetValueAsStringOrNull();
	}
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

public sealed class UpdateStaffUser {
	public static async Task<
		Results<
			Ok<GetStaffUserByIdResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult,
			AppInternalServerErrorHttpResult
		>
	> Handle(
		[FromRoute] string userId,
		[FromBody] UpdateStaffUserBody body,
		[FromServices] IStaffUserCoreService staffUserCoreService,
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
			await staffUserCoreService.UpdateStaffUserByIdAsync(
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
