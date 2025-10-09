using FluentValidation;
using MainApi.Localization;
using MainApi.Src.Features.Common.Email;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Utils;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace MainApi.Src.Features.Common.Auth.Handlers;

public class CheckEmailVerificationTokenQuery {
	public required string Id { get; set; }
	public required string Token { get; set; }
}

public class CheckEmailVerificationTokenQueryValidator : AbstractValidator<CheckEmailVerificationTokenQuery> {
	public CheckEmailVerificationTokenQueryValidator() {
		RuleFor(x => x.Id)
			.NotEmpty().WithMessage("ID is required")
			.Must(id => CryptoUtils.IsValidEncryptedString(id)).WithMessage("Invalid ID format");

		RuleFor(x => x.Token)
			.NotEmpty().WithMessage("Token is required");
	}
}

public class CheckEmailVerificationTokenResult {
	public string Status { get; set; } = "success";
	public string ResetPasswordLink { get; set; } = string.Empty;
}

public class CheckEmailVerificationToken {
	public static async Task<
		Results<
			Ok<CheckEmailVerificationTokenResult>,
			BadRequest<ApiResponse>
		>
	> HandleCheckEmailVerificationToken(
		[FromQuery] string id,
		[FromQuery] string token,
		[FromServices] IUserService userService,
		[FromServices] IEmailService emailService,
		[FromServices] ILogger<CheckEmailVerificationToken> logger,
		[FromServices] IOptions<AppSettings> appSettings,
		CancellationToken cancellationToken = default
	) {
		// Decrypt the ID to get email
		string email;
		try {
			email = CryptoUtils.DecryptString(id);
		} catch {
			return TypedResults.BadRequest(ApiResponse.Create(
				"Invalid or expired email verification token",
				ResponseKeys.InvalidEmailVerificationToken
			));
		}

		// Query user by email and email verification token
		var user = await userService.GetUserByEmailAndEmailVerifyTokenAsync(email, token, cancellationToken);

		if (user is null) {
			return TypedResults.BadRequest(ApiResponse.Create(
				"Invalid or expired email verification token",
				ResponseKeys.InvalidEmailVerificationToken
			));
		}

		// Check if token is expired
		if (user.EmailVerifyTokenExpiresAt.HasValue && DateTime.UtcNow > user.EmailVerifyTokenExpiresAt.Value) {
			return TypedResults.BadRequest(ApiResponse.Create(
				"Invalid or expired email verification token",
				ResponseKeys.InvalidEmailVerificationToken
			));
		}

		// Generate password reset token
		var passwordResetToken = CryptoUtils.RandomString(25);
		var passwordResetTokenExpiresAt = DateTime.UtcNow.AddDays(appSettings.Value.PASSWORD_RESET_TOKEN_VALIDITY_DURATION);

		// Update user
		user.IsVerified = true;
		user.PasswordResetToken = passwordResetToken;
		user.PasswordResetTokenExpiresAt = passwordResetTokenExpiresAt;
		user.EmailVerifyToken = null;
		user.EmailVerifyTokenExpiresAt = null;

		await userService.UpdateUserAsync(user, cancellationToken);

		// Create reset password link
		var resetPasswordLink = EmailService.CreateResetPasswordLink(passwordResetToken, user.Email);

		// Send success email asynchronously
		_ = emailService.SendEmail(
			user.Email,
			"Email Verification Success",
			$"<h1>Your email has been verified</h1>\n<p>You have been redirected to the reset password page automatically to change your password.</p>\n<p>If you did not reset your password at that time you can still do it by clicking the link below:</p>\n<a href=\"{resetPasswordLink}\">{resetPasswordLink}</a>"
		).ContinueWith(t => {
			if (t.Exception != null) {
				logger.LogError(t.Exception, "Error sending email verification success email to {Email}", user.Email);
			}
		}, cancellationToken);

		return TypedResults.Ok(new CheckEmailVerificationTokenResult {
			Status = "success",
			ResetPasswordLink = resetPasswordLink
		});
	}
}

