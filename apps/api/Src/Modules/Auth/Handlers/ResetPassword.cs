using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Infrastructure.Messaging.Email;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Lib.Validation;
using MainApi.Src.Modules.Auth.Utils;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Auth.Handlers;

public class ResetPasswordBody {
	public required JsonElement Id { get; set; }
	public required JsonElement Token { get; set; }
	public required JsonElement NewPassword { get; set; }
	public required JsonElement ConfirmPassword { get; set; }

	public string GetId() {
		return Id.GetValueAsString();
	}

	public string GetToken() {
		return Token.GetValueAsString();
	}

	public string GetNewPassword() {
		return NewPassword.GetValueAsString();
	}

	public string GetConfirmPassword() {
		return ConfirmPassword.GetValueAsString();
	}
}

public class ResetPasswordBodyValidator
	: AbstractValidator<ResetPasswordBody> {
	public ResetPasswordBodyValidator() {
		RuleFor(x => x.Id)
			.MustBeRequiredEncryptedId();

		RuleFor(x => x.Token)
			.MustBeRequiredString("Token");

		RuleFor(x => x.NewPassword)
			.MustBeRequiredPassword();

		RuleFor(x => x.ConfirmPassword)
			.MustBeRequiredString("Confirm password");

		// Cross-field: passwords must match
		RuleFor(x => x)
			.Must(body => {
				if (
					body.NewPassword.ValueKind
						== JsonValueKind.String
					&& body.ConfirmPassword.ValueKind
						== JsonValueKind.String
				) {
					return body.GetNewPassword()
						== body.GetConfirmPassword();
				}
				return true;
			})
			.WithMessage("Passwords are not the same")
			.WithName("ConfirmPassword");
	}
}

public class ResetPasswordResult {
	public string Status { get; set; } = "success";
}

public class ResetPassword {
	public static async Task<
		Results<
			Ok<ResetPasswordResult>,
			AppBadRequestHttpResult
		>
	> HandleResetPassword(
		[FromBody] ResetPasswordBody body,
		[FromServices] IUserService userService,
		[FromServices] IEmailService emailService,
		[FromServices] ILogger<ResetPassword> logger,
		CancellationToken cancellationToken
	) {
		// Get validated string values
		string id = body.GetId();
		string token = body.GetToken();
		string newPassword = body.GetNewPassword();

		// Decrypt the ID to get email
		string email;
		try {
			email = CryptoUtils.DecryptString(id);
		} catch {
			return TypedProblems.BadRequest(
				"Invalid or expired password reset token",
				ResponseKeys.InvalidPasswordResetToken
			);
		}

		// Query user by email and password reset token
		var user = await userService.GetUserByPasswordResetTokenAsync(token, cancellationToken);

		if (user is null) {
			return TypedProblems.BadRequest(
				"Invalid or expired password reset token",
				ResponseKeys.InvalidPasswordResetToken
			);
		}

		// check if token is for the given email
		if (string.Equals(user.Email, email, StringComparison.OrdinalIgnoreCase) is false) {
			return TypedProblems.BadRequest(
				"Invalid or expired password reset token",
				ResponseKeys.InvalidPasswordResetToken
			);
		}

		// Check if token is expired
		if (user.PasswordResetTokenExpiresAt.HasValue && DateTime.UtcNow > user.PasswordResetTokenExpiresAt.Value) {
			return TypedProblems.BadRequest(
				"Invalid or expired password reset token",
				ResponseKeys.InvalidPasswordResetToken
			);
		}

		// Hash new password
		var hashedPassword = PasswordUtils.HashPassword(newPassword);

		// Update user
		user.Password = hashedPassword;
		user.PasswordResetToken = null;
		user.PasswordResetTokenExpiresAt = null;

		await userService.UpdateUserAsync(user, cancellationToken);

		// Send email asynchronously with proper error handling
		// We don't await this because we want to return the response immediately
		_ = emailService.SendPasswordResetNotificationEmailAsync(user.Email)
			.ContinueWith(t => {
				if (t.Exception != null) {
					if (logger.IsEnabled(LogLevel.Error)) {
						logger.LogError(t.Exception, "Error sending password reset notification email to {Email}", user.Email);
					}
				}
			}, cancellationToken);

		return TypedResults.Ok(new ResetPasswordResult {
			Status = "success"
		});
	}
}
