using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Auth.Handlers;

public class CheckResetPasswordTokenQuery
	: EncryptedIdTokenQuery {
}

public class CheckResetPasswordTokenQueryValidator
	: EncryptedIdTokenQueryValidator<
		CheckResetPasswordTokenQuery> {
}

public class CheckResetPasswordTokenResult {
	public string Status { get; set; } = "success";
	public string Email { get; set; } = string.Empty;
}

public sealed class CheckResetPasswordToken {
	public static async Task<
		Results<
			Ok<CheckResetPasswordTokenResult>,
			AppBadRequestHttpResult
		>
	> Handle(
		[AsParameters] CheckResetPasswordTokenQuery query,
		[FromServices] IUserService userService,
		CancellationToken cancellationToken
	) {
		string id = query.Id;
		string token = query.Token;

		// Decrypt the ID to get email
		string email;
		try {
			email = CryptoUtils.DecryptString(id).ToLowerInvariant();
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
		if (
			user.PasswordResetTokenExpiresAt.HasValue
			&& DateTime.UtcNow > user.PasswordResetTokenExpiresAt.Value
		) {
			return TypedProblems.BadRequest(
				"This password reset link has expired",
				ResponseKeys.PasswordResetTokenExpired
			);
		}

		return TypedResults.Ok(new CheckResetPasswordTokenResult {
			Status = "success",
			Email = user.Email
		});
	}
}
