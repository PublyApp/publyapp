using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Users.Entities;
using MainApi.Src.Modules.Users.Services;

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

public class UpdateStaffUserBodyValidator : AbstractValidator<UpdateStaffUserBody> {
	public UpdateStaffUserBodyValidator() {
		RuleFor(x => x.Email)
			.Must(BeStringOrNull)
			.WithMessage("Email must be a string or null")
			.DependentRules(() => {
				RuleFor(x => x.Email)
					.Must(BeValidEmail)
					.WithMessage("Email must be a valid email address")
					.When(x => x.Email.HasValue && x.Email.Value.ValueKind == JsonValueKind.String);
			});

		RuleFor(x => x.LastName)
			.Must(BeStringOrNull)
			.WithMessage("LastName must be a string or null")
			.DependentRules(() => {
				RuleFor(x => x.LastName)
					.Must(BeNotEmpty)
					.WithMessage("LastName must not be empty")
					.When(x => x.LastName.HasValue && x.LastName.Value.ValueKind == JsonValueKind.String);
			});

		RuleFor(x => x.FirstName)
			.Must(BeStringOrNull)
			.WithMessage("FirstName must be a string or null")
			.DependentRules(() => {
				RuleFor(x => x.FirstName)
					.Must(BeNotEmpty)
					.WithMessage("FirstName must not be empty")
					.When(x => x.FirstName.HasValue && x.FirstName.Value.ValueKind == JsonValueKind.String);
			});

		RuleFor(x => x.AvatarUrl)
			.Must(BeStringOrNull)
			.WithMessage("AvatarUrl must be a string or null")
			.DependentRules(() => {
				RuleFor(x => x.AvatarUrl)
					.Must(BeValidUrl)
					.WithMessage("AvatarUrl must be a valid URL")
					.When(x => x.AvatarUrl.HasValue && x.AvatarUrl.Value.ValueKind == JsonValueKind.String);
			});

		RuleFor(x => x.AccountLevel)
			.Must(BeStringOrNull)
			.WithMessage("AccountLevel must be a string or null")
			.DependentRules(() => {
				RuleFor(x => x.AccountLevel)
					.Must(BeValidAccountLevel)
					.WithMessage("AccountLevel must be a valid account level")
					.When(x => x.AccountLevel.HasValue && x.AccountLevel.Value.ValueKind == JsonValueKind.String);
			});

		RuleFor(x => x.Status)
			.Must(BeStringOrNull)
			.WithMessage("Status must be a string or null")
			.DependentRules(() => {
				RuleFor(x => x.Status)
					.Must(BeValidStatus)
					.WithMessage("Status must be a valid status")
					.When(x => x.Status.HasValue && x.Status.Value.ValueKind == JsonValueKind.String);
			});
	}

	private static bool BeValidStatus(JsonElement? element) {
		if (element is null) return true;
		if (element.Value.ValueKind is JsonValueKind.Null) return true;
		var statusString = element?.GetString() ?? string.Empty;
		return User.ParseStatus(statusString) is not null;
	}

	private static bool BeStringOrNull(JsonElement? element) {
		if (element is null) return true;
		var valueKind = element.Value.ValueKind;
		return valueKind is JsonValueKind.String or JsonValueKind.Null;
	}

	private static bool BeValidEmail(JsonElement? element) {
		if (element is null) return true;
		if (element.Value.ValueKind is JsonValueKind.Null) return true;
		var email = element?.GetString();
		if (string.IsNullOrWhiteSpace(email)) return false;
		try {
			var addr = new System.Net.Mail.MailAddress(email);
			return addr.Address == email;
		} catch {
			return false;
		}
	}

	private static bool BeValidUrl(JsonElement? element) {
		if (element is null) return true;
		if (element.Value.ValueKind is JsonValueKind.Null) return true;

		var url = element?.GetString();
		if (string.IsNullOrWhiteSpace(url)) return false;

		var isValidUri = Uri.TryCreate(url, UriKind.Absolute, out Uri? result);
		if (!isValidUri) return false;
		return result?.Scheme == Uri.UriSchemeHttp || result?.Scheme == Uri.UriSchemeHttps;
	}

	private static bool BeNotEmpty(JsonElement? element) {
		if (element is null) return true;
		if (element.Value.ValueKind is JsonValueKind.Null) return true;
		var value = element?.GetString();
		return !string.IsNullOrWhiteSpace(value);
	}

	private static bool BeValidAccountLevel(JsonElement? element) {
		if (element is null) return true;
		if (element.Value.ValueKind is JsonValueKind.Null) return true;
		var accountLevelString = element?.GetString() ?? string.Empty;
		return UserAccount.ParseAccountLevel(accountLevelString) is not null;
	}
}

public class UpdateStaffUser {
	public static async Task<
		Results<
			Ok<ApiResponse>,
			AppBadRequestHttpResult,
			AppInternalServerErrorHttpResult
		>
	> HandleUpdateStaffUser(
		[FromRoute] string userId,
		[FromBody] UpdateStaffUserBody body,
		[FromServices] IUserService UserService,
		ILogger<UpdateStaffUser> logger,
		CancellationToken cancellationToken
	) {
		var parseResult = Guid.TryParse(userId, out var userIdGuid);

		if (!parseResult) {
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug("Invalid user id: {@LogData}", new { UserId = userId });
			}

			return TypedProblems.BadRequest(
				"User does not exist or is not a staff member",
				ResponseKeys.UserNotFound
			);
		}

		var updateUserDocument = new UpdateUserDocument {
			Email = body.GetEmail(),
			LastName = body.GetLastName(),
			FirstName = body.GetFirstName(),
			AvatarUrl = body.GetAvatarUrl(),
			AccountLevel = body.GetAccountLevel(),
		};

		var result = await UserService.UpdateStaffUserByIdAsync(userIdGuid, updateUserDocument, cancellationToken);

		if (result is UpdateUserByIdResult.UserNotFound) {
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug("User not found: {@LogData}", new { UserId = userIdGuid });
			}

			return TypedProblems.BadRequest(
				"User does not exist or is not a staff member",
				ResponseKeys.UserNotFound
			);
		}

		if (result is UpdateUserByIdResult.UserAccountNotFound) {
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug("User account not found: {@LogData}", new { UserId = userIdGuid });
			}

			return TypedProblems.BadRequest(
				"User account does not exist or is not a staff member",
				ResponseKeys.UserNotFound
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

		return TypedResults.Ok(ApiResponse.Create("Staff member updated successfully", ResponseKeys.StaffUserUpdatedSuccessfully));
	}
}
