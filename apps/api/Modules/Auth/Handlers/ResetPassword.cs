using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Auth.Handlers;

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

public sealed class ResetPassword {
	public static async Task<
		Results<
			Ok<ResetPasswordResult>,
			AppBadRequestHttpResult
		>
	> Handle(
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
		if (!string.Equals(user.Email, email, StringComparison.OrdinalIgnoreCase)) {
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

		// Best-effort notification: best-effort and non-request-scoped to avoid
		// cancellations caused by request completion.
		_ = Task.Run(
			async () => {
				try {
					await emailService.SendPasswordResetNotificationEmailAsync(user.Email);
				} catch (Exception ex) {
					if (logger.IsEnabled(LogLevel.Error)) {
						logger.LogError(
							ex,
							"Error sending password reset notification email to {Email}",
							user.Email
						);
					}
				}
			},
			CancellationToken.None
		);

		return TypedResults.Ok(new ResetPasswordResult {
			Status = "success"
		});
	}
}
