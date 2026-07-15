using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Auth.Handlers;

public class RequestPasswordResetBody {
	public required JsonElement Email { get; set; }

	public string GetEmail() {
		return Email.GetValueAsString();
	}
}

public class RequestPasswordResetBodyValidator
	: AbstractValidator<RequestPasswordResetBody> {
	public RequestPasswordResetBodyValidator() {
		RuleFor(x => x.Email)
			.MustBeRequiredEmail();
	}
}

public class RequestPasswordResetResult {
	public string Status { get; set; } = "success";
}

// r5-users-auth-F3: the public "forgot password" screen previously called
// VerifyEmailRequest (an email-verification-token action) and unconditionally
// rendered "Reset link sent" regardless of the actual response. That handler
// rejects every already-verified user with EmailAlreadyVerified and never
// sends a reset email for the password-reset case — so a verified user's
// forgot-password request silently did nothing. This handler generates and
// emails a real password-reset token directly, and always returns the same
// generic success response regardless of whether the email exists or is
// verified, so a submitted address can never be used to probe account
// existence (the exact contract the front-end already assumed).
public sealed class RequestPasswordReset {
	public static async Task<Ok<RequestPasswordResetResult>> Handle(
		[FromBody] RequestPasswordResetBody body,
		[FromServices] IUserService userService,
		[FromServices] IEmailService emailService,
		[FromServices] ILogger<RequestPasswordReset> logger,
		CancellationToken cancellationToken
	) {
		var env = AppEnvironment.Instance;
		var email = body.GetEmail();

		var user = await userService.GetUserByEmailAsync(email, cancellationToken);

		// A verified user is the only case that gets a real reset link — an
		// unverified user has no password to reset yet and must complete the
		// email-verification flow first (matches CheckEmailVerificationToken's
		// own shouldResetPassword gate). Either way, the response below never
		// varies, so this branch is invisible to the caller.
		if (user is not null && user.IsVerified) {
			// round-6 F5: a still-live (unexpired) token is reused rather than
			// rotated. Rotating on every hit let a repeated request silently
			// invalidate a legitimate link the user had not yet clicked — an
			// attacker (or an accidental double-submit) could strand the real
			// user mid-reset. An already-expired or never-issued token still
			// gets a fresh one.
			string passwordResetToken;
			if (user.PasswordResetToken is not null
				&& user.PasswordResetTokenExpiresAt is { } existingExpiresAt
				&& existingExpiresAt > DateTime.UtcNow) {
				passwordResetToken = user.PasswordResetToken;
			} else {
				passwordResetToken = CryptoUtils.RandomString(env.PASSWORD_RESET_TOKEN_LENGTH);
				var passwordResetTokenExpiresAt = DateTime.UtcNow.AddDays(
					env.PASSWORD_RESET_TOKEN_VALIDITY_DURATION
				);

				user.PasswordResetToken = passwordResetToken;
				user.PasswordResetTokenExpiresAt = passwordResetTokenExpiresAt;

				await userService.UpdateUserAsync(user, cancellationToken);
			}

			var userEmail = user.Email;

			// Send email asynchronously with proper error handling
			// We don't await this because we want to return the response
			// immediately, and its outcome must not vary the response either
			// way (see the doc comment above).
			_ = emailService.SendResetPasswordRequestEmailAsync(userEmail, passwordResetToken)
				.ContinueWith(t => {
					if (t.Exception is not null) {
						if (logger.IsEnabled(LogLevel.Error)) {
							logger.LogError(t.Exception, "Error sending password reset request email to {Email}", userEmail);
						}
					}
				}, cancellationToken);
		}

		return TypedResults.Ok(new RequestPasswordResetResult());
	}
}
