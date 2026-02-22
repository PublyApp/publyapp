using MainApi.Localization;
using MainApi.Src.Infrastructure.Messaging.Email;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Lib.Validation;
using MainApi.Src.Modules.Auth.Utils;
using MainApi.Src.Modules.Users.Entities;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Auth.Handlers;

public class CheckEmailVerificationTokenQuery
	: EncryptedIdTokenQuery {
}

public class CheckEmailVerificationTokenQueryValidator
	: EncryptedIdTokenQueryValidator<
		CheckEmailVerificationTokenQuery> {
}

public class CheckEmailVerificationTokenResult {
	public string Status { get; set; } = "success";
	public string? ResetPasswordUrl { get; set; }
}

public class CheckEmailVerificationToken {
	public static async Task<
		Results<
			Ok<CheckEmailVerificationTokenResult>,
			AppBadRequestHttpResult
		>
	> HandleCheckEmailVerificationToken(
		[AsParameters] CheckEmailVerificationTokenQuery query,
		[FromServices] IUserService userService,
		[FromServices] IEmailService emailService,
		[FromServices] ILogger<CheckEmailVerificationToken> logger,
		CancellationToken cancellationToken
	) {
		var env = AppEnvironment.Instance;
		string id = query.Id;
		string token = query.Token;

		// Decrypt the ID to get email
		string email;
		try {
			email = CryptoUtils.DecryptString(id).ToLowerInvariant();
		} catch {
			return TypedProblems.BadRequest(
				"Invalid or expired email verification token",
				ResponseKeys.InvalidEmailVerificationToken
			);
		}

		// Query user by email verification token
		var user = await userService.GetUserByEmailVerificationTokenAsync(token, cancellationToken);

		if (user is null) {
			return TypedProblems.BadRequest(
				"Invalid or expired email verification token",
				ResponseKeys.InvalidEmailVerificationToken
			);
		}

		// check if token is for the given email
		if (string.Equals(user.Email, email, StringComparison.OrdinalIgnoreCase) is false) {
			return TypedProblems.BadRequest(
				"Invalid or expired email verification token",
				ResponseKeys.InvalidEmailVerificationToken
			);
		}

		var shouldResetPassword = false;

		if (!user.IsVerified) {
			shouldResetPassword = true;
		}

		// Check if token is expired
		if (user.EmailVerifyTokenExpiresAt.HasValue
			&& DateTime.UtcNow > user.EmailVerifyTokenExpiresAt.Value
		) {
			return TypedProblems.BadRequest(
				"Invalid or expired email verification token",
				ResponseKeys.InvalidEmailVerificationToken
			);
		}

		// Generate password reset token
		string? passwordResetToken = null;
		DateTime? passwordResetTokenExpiresAt = null;

		if (shouldResetPassword) {
			passwordResetToken = CryptoUtils.RandomString(env.PASSWORD_RESET_TOKEN_LENGTH);
			passwordResetTokenExpiresAt = DateTime.UtcNow.AddDays(
				env.PASSWORD_RESET_TOKEN_VALIDITY_DURATION
			);
		}

		// Update user
		user.IsVerified = true;
		user.Status = UserStatus.Active;
		user.EmailVerifyToken = null;
		user.EmailVerifyTokenExpiresAt = null;

		if (shouldResetPassword && passwordResetToken is not null) {
			user.PasswordResetToken = passwordResetToken;
		}
		if (shouldResetPassword && passwordResetTokenExpiresAt is not null) {
			user.PasswordResetTokenExpiresAt = passwordResetTokenExpiresAt;
		}

		await userService.UpdateUserAsync(user, cancellationToken);

		// Create reset password link
		string? resetPasswordUrl = null;

		if (shouldResetPassword && passwordResetToken is not null) {
			resetPasswordUrl = AuthUtils.CreateResetPasswordUrl(passwordResetToken, user.Email);
		}

		// Send success email asynchronously
		_ = emailService.SendEmailVerifiedNotificationAsync(user.Email)
		.ContinueWith(t => {
			if (t.Exception != null) {
				if (logger.IsEnabled(LogLevel.Error)) {
					logger.LogError(
						t.Exception,
						"Error sending email verification success email to {Email}",
						user.Email
					);
				}
			}
		}, cancellationToken);

		return TypedResults.Ok(new CheckEmailVerificationTokenResult {
			Status = "success",
			ResetPasswordUrl = resetPasswordUrl
		});
	}
}
