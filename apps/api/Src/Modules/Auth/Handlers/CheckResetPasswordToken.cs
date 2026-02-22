using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Lib.Validation;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Auth.Handlers;

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

public class CheckResetPasswordToken {
	public static async Task<
		Results<
			Ok<CheckResetPasswordTokenResult>,
			AppBadRequestHttpResult
		>
	> HandleCheckResetPasswordToken(
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
		if (string.Equals(user.Email, email, StringComparison.OrdinalIgnoreCase) is false) {
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
				"Invalid or expired password reset token",
				ResponseKeys.InvalidPasswordResetToken
			);
		}

		return TypedResults.Ok(new CheckResetPasswordTokenResult {
			Status = "success",
			Email = user.Email
		});
	}
}

