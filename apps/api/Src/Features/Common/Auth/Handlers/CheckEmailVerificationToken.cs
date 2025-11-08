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
		[AsParameters] CheckEmailVerificationTokenQuery query,
		[FromServices] IUserService userService,
		[FromServices] IEmailService emailService,
		[FromServices] ILogger<CheckEmailVerificationToken> logger,
		[FromServices] IOptions<AppSettings> appSettings,
		CancellationToken cancellationToken
	) {
		string id = query.Id;
		string token = query.Token;

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
		var passwordResetToken = CryptoUtils.RandomString(appSettings.Value.PASSWORD_RESET_TOKEN_LENGTH);
		var passwordResetTokenExpiresAt = DateTime.UtcNow.AddDays(appSettings.Value.PASSWORD_RESET_TOKEN_VALIDITY_DURATION);

		// Update user
		user.IsVerified = true;
		user.Status = UserStatus.Active;
		user.PasswordResetToken = passwordResetToken;
		user.PasswordResetTokenExpiresAt = passwordResetTokenExpiresAt;
		user.EmailVerifyToken = null;
		user.EmailVerifyTokenExpiresAt = null;

		await userService.UpdateUserAsync(user, cancellationToken);

		// Create reset password link
		var resetPasswordUrl = AuthUtils.CreateResetPasswordUrl(passwordResetToken, user.Email);

		// Send success email asynchronously
		_ = emailService.SendEmailVerifiedNotificationAsync(user.Email)
		.ContinueWith(t => {
			if (t.Exception != null) {
				logger.LogError(t.Exception, "Error sending email verification success email to {Email}", user.Email);
			}
		}, cancellationToken);

		return TypedResults.Ok(new CheckEmailVerificationTokenResult {
			Status = "success",
			ResetPasswordLink = resetPasswordUrl
		});
	}
}

