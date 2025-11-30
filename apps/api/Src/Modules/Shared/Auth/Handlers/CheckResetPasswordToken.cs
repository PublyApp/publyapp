using FluentValidation;
using MainApi.Localization;
using MainApi.Src.Modules.Shared.Users;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Utils;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Shared.Auth.Handlers;

public class CheckResetPasswordTokenQuery {
	public required string Id { get; set; }
	public required string Token { get; set; }
}

public class CheckResetPasswordTokenQueryValidator : AbstractValidator<CheckResetPasswordTokenQuery> {
	public CheckResetPasswordTokenQueryValidator() {
		RuleFor(x => x.Id)
			.NotEmpty().WithMessage("ID is required")
			.Must(id => CryptoUtils.IsValidEncryptedString(id)).WithMessage("Invalid ID format");

		RuleFor(x => x.Token)
			.NotEmpty().WithMessage("Token is required");
	}
}

public class CheckResetPasswordTokenResult {
	public string Status { get; set; } = "success";
	public string Email { get; set; } = string.Empty;
}

public class CheckResetPasswordToken {
	public static async Task<
		Results<
			Ok<CheckResetPasswordTokenResult>,
			BadRequest<ApiResponse>
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
			return TypedResults.BadRequest(ApiResponse.Create(
				"Invalid or expired password reset token",
				ResponseKeys.InvalidPasswordResetToken
			));
		}

		// Query user by email and password reset token
		var user = await userService.GetUserByPasswordResetTokenAsync(token, cancellationToken);

		if (user is null) {
			return TypedResults.BadRequest(ApiResponse.Create(
				"Invalid or expired password reset token",
				ResponseKeys.InvalidPasswordResetToken
			));
		}

		// check if token is for the given email
		if (string.Equals(user.Email, email, StringComparison.OrdinalIgnoreCase) is false) {
			return TypedResults.BadRequest(ApiResponse.Create(
				"Invalid or expired password reset token",
				ResponseKeys.InvalidPasswordResetToken
			));
		}

		// Check if token is expired
		if (
			user.PasswordResetTokenExpiresAt.HasValue
			&& DateTime.UtcNow > user.PasswordResetTokenExpiresAt.Value
		) {
			return TypedResults.BadRequest(ApiResponse.Create(
				"Invalid or expired password reset token",
				ResponseKeys.InvalidPasswordResetToken
			));
		}

		return TypedResults.Ok(new CheckResetPasswordTokenResult {
			Status = "success",
			Email = user.Email
		});
	}
}

