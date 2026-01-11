using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Infrastructure.Messaging.Email;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Shared.Auth;
using MainApi.Src.Modules.Shared.Users;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

using AccountNs = MainApi.Src.Modules.Shared.Users;

namespace MainApi.Src.Modules.Staff.StaffMember.Handlers;

public class CreateStaffMemberResult {
	public Guid Id { get; set; }
	public Guid AccountId { get; set; }
}

public class CreateStaffMemberBody {
	public JsonElement Email { get; set; }
	public JsonElement LastName { get; set; }
	public JsonElement? FirstName { get; set; }
	public JsonElement? AvatarUrl { get; set; }
	public JsonElement? AccountLevel { get; set; }
	public JsonElement? SendNotification { get; set; }

	public string GetEmail() {
		return Email.GetValueAsString();
	}

	public string GetLastName() {
		return LastName.GetValueAsString();
	}

	public string? GetFirstName() {
		return FirstName.GetValueAsStringOrNull();
	}

	public string? GetAvatarUrl() {
		return AvatarUrl.GetValueAsStringOrNull();
	}

	public bool GetSendNotification() {
		return SendNotification.GetValueAsBoolean();
	}

	public AccountLevel GetAccountLevel() {
		switch (AccountLevel?.ValueKind) {
			case null: {
					return AccountNs.AccountLevel.User;
				}
			case JsonValueKind.Null: {
					return AccountNs.AccountLevel.User;
				}
			case JsonValueKind.Undefined: {
					return AccountNs.AccountLevel.User;
				}
			case JsonValueKind.String: {
					var accountLevelString = AccountLevel.GetValueAsString();
					var accountLevel = UserAccount.ParseAccountLevel(accountLevelString);
					if (accountLevel is null) {
						throw new InvalidOperationException("Invalid account level: " + accountLevelString);
					}
					return accountLevel.Value;
				}
			default: {
					throw new InvalidOperationException("AccountLevel must be a string or null");
				}
		}
	}
}

public class PasswordRegisterBodyValidator : AbstractValidator<CreateStaffMemberBody> {
	public PasswordRegisterBodyValidator() {
		RuleFor(x => x.Email)
			.NotEmpty().WithMessage("Email is required")
			.DependentRules(() => {
				RuleFor(x => x.Email)
					.Must(email => email.ValueKind == JsonValueKind.String)
					.WithMessage("mail must be a string")
					.DependentRules(() => {
						RuleFor(x => x.Email.GetString()!)
							.EmailAddress().WithMessage("Invalid email address");
					});
			});

		RuleFor(x => x.LastName)
			.NotEmpty().WithMessage("LastName is required")
			.DependentRules(() => {
				RuleFor(x => x.LastName)
					.Must(lastName => lastName.ValueKind == JsonValueKind.String)
					.WithMessage("LastName must be a string")
					.DependentRules(() => {
						RuleFor(x => x.LastName.GetString()!)
							.NotEmpty().WithMessage("LastName is required");
					});
			});

		RuleFor(x => x.FirstName)
			.Must(BeNullableString)
			.WithMessage("FirstName must be a string or null")
				.DependentRules(() => {
					RuleFor(x => x.FirstName)
						.NotEmpty().WithMessage("FirstName must not be empty");
				});

		RuleFor(x => x.AvatarUrl)
			.Must(BeNullableString)
			.WithMessage("AvatarUrl must be a string or null")
				.DependentRules(() => {
					RuleFor(x => x.AvatarUrl)
						.Must(BeNullableValidUrl)
						.WithMessage("AvatarUrl must be a valid URL");
				});

		RuleFor(x => x.AccountLevel)
			.Must(BeNullableString)
			.WithMessage("AvatarUrl must be a string or null")
			.DependentRules(() => {
				RuleFor(x => x.AccountLevel)
					.Must(BeValidAccountLevelNullable)
					.WithMessage("AccountLevel must be a valid account level");
			});

		RuleFor(x => x.SendNotification)
			.Must(BeNullableBoolean)
			.WithMessage("SendNotification must be a boolean or null");
	}

	private static bool BeNullableBoolean(JsonElement? element) {
		if (element is null) {
			return true;
		}
		if ((element?.ValueKind is JsonValueKind.Null) || (element?.ValueKind is JsonValueKind.Undefined)) {
			return false;
		}
		if ((element?.ValueKind is JsonValueKind.True) || (element?.ValueKind is JsonValueKind.False)) {
			return true;
		}
		return false;
	}

	private static bool BeValidAccountLevelNullable(JsonElement? element) {
		if (element is null) {
			return true;
		}
		if (element?.ValueKind == JsonValueKind.String) {
			var accountLevel = UserAccount.ParseAccountLevel(element?.GetString() ?? "");
			if (accountLevel is null) {
				return false;
			}
			return true;
		}
		return false;
	}

	private static bool BeNullableString(JsonElement? element) {
		if (element is null) {
			return true;
		}
		return element?.ValueKind == JsonValueKind.String;
	}

	private static bool BeNullableValidUrl(JsonElement? element) {
		if (element is null) {
			return true;
		}

		if (element?.ValueKind != JsonValueKind.String) {
			return false;
		}

		var url = element?.GetString();

		if (string.IsNullOrWhiteSpace(url)) {
			return false;
		}

		if (!Uri.TryCreate(url, UriKind.Absolute, out Uri? result)) {
			return false;
		}

		if (result.Scheme != Uri.UriSchemeHttp && result.Scheme != Uri.UriSchemeHttps) {
			return false;
		}

		return true;
	}
}

public class CreateStaffMember {
	public static async Task<
		Results<
			Ok<CreateStaffMemberResult>,
			AppBadRequestHttpResult
		>
	> HandleCreateStaffMember(
		[FromBody] CreateStaffMemberBody body,
		[FromServices] IUserService userService,
		[FromServices] IAccountService accountService,
		[FromServices] IEmailService emailService,
		[FromServices] IOptions<AppSettings> appSettings,
		[FromServices] ILogger<CreateStaffMember> logger,
		CancellationToken cancellationToken
	) {
		var password = CryptoUtils.RandomString(appSettings.Value.PASSWORD_MIN_LENGTH);
		password = PasswordUtils.HashPassword(password);

		var user = new User {
			Email = body.GetEmail(),
			Password = password,
			LastName = body.GetLastName(),
			FirstName = body.GetFirstName(),
			AvatarUrl = body.GetAvatarUrl(),
			IsVerified = false,
		};

		if (body.GetSendNotification()) {
			user.IsVerified = false;
			user.EmailVerifyToken = CryptoUtils.RandomString(appSettings.Value.EMAIL_VERIFY_TOKEN_LENGTH);
			user.EmailVerifyTokenExpiresAt = DateTime.UtcNow.AddDays(appSettings.Value.EMAIL_VERIFY_TOKEN_VALIDITY_DURATION);
		}

		var userResult = await userService.CreateUserAsync(user, cancellationToken);

		Guid userIdGuid;

		var shouldVerifyEmail = false;

		if (userResult is CreateUserResult.UserAlreadyExists alreadyExistUserResult) {
			// That's okay, we can use the existing user
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug(
					"User already exists, using existing user: {@LogData}",
					new { UserId = alreadyExistUserResult.User.GetRequiredId() }
				);
			}
			userIdGuid = alreadyExistUserResult.User.GetRequiredId();
		} else if (userResult is CreateUserResult.Success successCreateUserResult) {
			shouldVerifyEmail = true;
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug(
					"User created successfully, using new user: {@LogData}",
					new { UserId = successCreateUserResult.User.GetRequiredId() }
				);
			}
			userIdGuid = successCreateUserResult.User.GetRequiredId();
		} else {
			if (logger.IsEnabled(LogLevel.Error)) {
				logger.LogError(
					"Failed to create user: {@LogData}",
					new { UserResult = userResult }
				);
			}
			return TypedProblems.BadRequest(
				"Failed to create user",
				ResponseKeys.FailedToCreateUser
			);
		}

		// Create staff account using AccountService
		var accountResult = await accountService.CreateStaffAccountAsync(
			userIdGuid,
			accountLevel: body.GetAccountLevel(),
			cancellationToken
		);

		if (accountResult is CreateStaffAccountResult.UserAlreadyStaffMember) {
			return TypedProblems.BadRequest(
				"User is already member of staff",
				ResponseKeys.UserAlreadyMemberOfStaff
			);
		}

		if (accountResult is CreateStaffAccountResult.Success accountSuccess) {
			if (body.GetSendNotification()) {
				if (shouldVerifyEmail) {
					if (string.IsNullOrEmpty(user.EmailVerifyToken)) {
						throw new InvalidOperationException("Email verify should not be null or empty");
					}
					await emailService.SendStaffWelcomeEmailAsync(user.Email, user.EmailVerifyToken);
				} else {
					await emailService.SendJoinedStaffNotificationEmailAsync(user.Email);
				}
			}
			return TypedResults.Ok(new CreateStaffMemberResult {
				Id = userIdGuid,
				AccountId = accountSuccess.Account.GetRequiredId(),
			});
		}

		return TypedProblems.BadRequest(
			"Failed to create user",
			ResponseKeys.FailedToCreateUser
		);
	}
}
