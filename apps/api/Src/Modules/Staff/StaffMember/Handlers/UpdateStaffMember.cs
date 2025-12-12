using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using AccountNs = MainApi.Src.Modules.Shared.Users;
using UserNs = MainApi.Src.Modules.Shared.Users;

namespace MainApi.Src.Modules.Staff.StaffMember.Handlers;

public class UpdateStaffMemberBody {
	public JsonElement? Email { get; set; }
	public JsonElement? LastName { get; set; }
	public JsonElement? FirstName { get; set; }
	public JsonElement? AvatarUrl { get; set; }
	public JsonElement? AccountLevel { get; set; }
	public JsonElement? Status { get; set; }

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

	public string? GetStatus() {
		return Status?.GetValueAsStringOrNull();
	}
}

public class UpdateStaffMemberBodyValidator : AbstractValidator<UpdateStaffMemberBody> {
	public UpdateStaffMemberBodyValidator() {
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
		if (element is null) {
			return true;
		}

		if (element.Value.ValueKind is JsonValueKind.Null) {
			return true;
		}

		var statusString = element?.GetString() ?? string.Empty;
		var parsedStatus = UserNs.User.ParseStatus(statusString);
		var isValid = parsedStatus is not null;

		return isValid;
	}

	private static bool BeStringOrNull(JsonElement? element) {
		if (element is null) {
			return true;
		}

		var valueKind = element.Value.ValueKind;
		var isString = valueKind is JsonValueKind.String;
		var isJsonNull = valueKind is JsonValueKind.Null;

		return isString || isJsonNull;
	}

	private static bool BeValidEmail(JsonElement? element) {
		if (element is null) {
			return true;
		}

		if (element.Value.ValueKind is JsonValueKind.Null) {
			return true;
		}

		var email = element?.GetString();

		if (string.IsNullOrWhiteSpace(email)) {
			return false;
		}

		try {
			var addr = new System.Net.Mail.MailAddress(email);
			var isValidFormat = addr.Address == email;
			return isValidFormat;
		} catch {
			return false;
		}
	}

	private static bool BeValidUrl(JsonElement? element) {
		if (element is null) {
			return true;
		}

		if (element.Value.ValueKind is JsonValueKind.Null) {
			return true;
		}

		var url = element?.GetString();

		if (string.IsNullOrWhiteSpace(url)) {
			return false;
		}

		var isValidUri = Uri.TryCreate(url, UriKind.Absolute, out Uri? result);
		if (!isValidUri) {
			return false;
		}

		var isHttpScheme = result?.Scheme == Uri.UriSchemeHttp;
		var isHttpsScheme = result?.Scheme == Uri.UriSchemeHttps;
		var hasValidScheme = isHttpScheme || isHttpsScheme;

		return hasValidScheme;
	}

	private static bool BeNotEmpty(JsonElement? element) {
		if (element is null) {
			return true;
		}

		if (element.Value.ValueKind is JsonValueKind.Null) {
			return true;
		}

		var value = element?.GetString();
		var isNotEmpty = !string.IsNullOrWhiteSpace(value);

		return isNotEmpty;
	}

	private static bool BeValidAccountLevel(JsonElement? element) {
		if (element is null) {
			return true;
		}

		if (element.Value.ValueKind is JsonValueKind.Null) {
			return true;
		}

		var accountLevelString = element?.GetString() ?? string.Empty;
		var parsedLevel = AccountNs.UserAccount.ParseAccountLevel(accountLevelString);
		var isValid = parsedLevel is not null;

		return isValid;
	}
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
		ILogger<UpdateStaffMember> logger,
		CancellationToken cancellationToken
	) {
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
