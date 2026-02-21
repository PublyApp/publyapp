using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Infrastructure.Messaging.Email;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Auth.Utils;
using MainApi.Src.Modules.Users.Entities;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using AccountLevelEnum = MainApi.Src.Modules.Users.Entities.AccountLevel;

namespace MainApi.Src.Modules.Users.Handlers.Staff;

public class CreateStaffUserResult {
	public Guid Id { get; set; }
	public Guid AccountId { get; set; }
}

public class CreateStaffUserBody {
	public JsonElement Email { get; set; }
	public JsonElement LastName { get; set; }
	public JsonElement? FirstName { get; set; }
	public JsonElement? AvatarUrl { get; set; }
	public JsonElement? AccountLevel { get; set; }
	public JsonElement? SendNotification { get; set; }

	public string GetEmail() => Email.GetValueAsString();
	public string GetLastName() => LastName.GetValueAsString();
	public string? GetFirstName() => FirstName.GetValueAsStringOrNull();
	public string? GetAvatarUrl() => AvatarUrl.GetValueAsStringOrNull();
	public bool GetSendNotification() => SendNotification.GetValueAsBoolean();

	public AccountLevel GetAccountLevel() {
		switch (AccountLevel?.ValueKind) {
			case null:
			case JsonValueKind.Null:
			case JsonValueKind.Undefined:
				return AccountLevelEnum.User;
			case JsonValueKind.String: {
					var accountLevelString = AccountLevel.GetValueAsString();
					var accountLevel = UserAccount.ParseAccountLevel(accountLevelString);
					if (accountLevel is null) {
						throw new InvalidOperationException("Invalid account level: " + accountLevelString);
					}
					return accountLevel.Value;
				}
			default:
				throw new InvalidOperationException("AccountLevel must be a string or null");
		}
	}
}

public class CreateStaffUserBodyValidator : AbstractValidator<CreateStaffUserBody> {
	public CreateStaffUserBodyValidator() {
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
		if (element is null) return true;
		if (element?.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined) return false;
		return element?.ValueKind is JsonValueKind.True or JsonValueKind.False;
	}

	private static bool BeValidAccountLevelNullable(JsonElement? element) {
		if (element is null) return true;
		if (element?.ValueKind != JsonValueKind.String) return false;
		return UserAccount.ParseAccountLevel(element?.GetString() ?? "") is not null;
	}

	private static bool BeNullableString(JsonElement? element) {
		if (element is null) return true;
		return element?.ValueKind == JsonValueKind.String;
	}

	private static bool BeNullableValidUrl(JsonElement? element) {
		if (element is null) return true;
		if (element?.ValueKind != JsonValueKind.String) return false;

		var url = element?.GetString();
		if (string.IsNullOrWhiteSpace(url)) return false;
		if (!Uri.TryCreate(url, UriKind.Absolute, out Uri? result)) return false;
		return result.Scheme == Uri.UriSchemeHttp || result.Scheme == Uri.UriSchemeHttps;
	}
}

public class CreateStaffUser {
	public static async Task<
		Results<
			Created<CreateStaffUserResult>,
			AppBadRequestHttpResult
		>
	> HandleCreateStaffUser(
		[FromBody] CreateStaffUserBody body,
		[FromServices] IUserService userService,
		[FromServices] IAccountService accountService,
		[FromServices] IEmailService emailService,
		[FromServices] ILogger<CreateStaffUser> logger,
		CancellationToken cancellationToken
	) {
		var env = AppEnvironment.Instance;
		var password = CryptoUtils.RandomString(env.PASSWORD_MIN_LENGTH);
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
			user.EmailVerifyToken = CryptoUtils.RandomString(env.EMAIL_VERIFY_TOKEN_LENGTH);
			user.EmailVerifyTokenExpiresAt = DateTime.UtcNow.AddDays(env.EMAIL_VERIFY_TOKEN_VALIDITY_DURATION);
		}

		var userResult = await userService.CreateUserAsync(user, cancellationToken);

		Guid userIdGuid;
		var shouldVerifyEmail = false;

		if (userResult is CreateUserResult.UserAlreadyExists alreadyExistUserResult) {
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

		var accountResult = await accountService.CreateStaffAccountAsync(
			userIdGuid,
			accountLevel: body.GetAccountLevel(),
			cancellationToken
		);

		if (accountResult is CreateStaffAccountResult.UserAlreadyStaffUser) {
			return TypedProblems.BadRequest(
				"User is already member of staff",
				ResponseKeys.UserAlreadyMemberOfStaff
			);
		}

		if (accountResult is CreateStaffAccountResult.UserHasTenantOrProjectAccounts) {
			return TypedProblems.BadRequest(
				"This user already has tenant or project accounts. Staff and tenant/project accounts are mutually exclusive.",
				ResponseKeys.UserHasTenantOrProjectAccounts
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
			return TypedResults.Created(
				(string?)null,
				new CreateStaffUserResult {
					Id = userIdGuid,
					AccountId = accountSuccess
						.Account.GetRequiredId(),
				}
			);
		}

		return TypedProblems.BadRequest(
			"Failed to create user",
			ResponseKeys.FailedToCreateUser
		);
	}
}
