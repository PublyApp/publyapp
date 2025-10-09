using System.Text.Json;
using FluentValidation;
using MainApi.Localization;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Utils;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace MainApi.Src.Features.Common.Auth.Handlers;

public class ResetPasswordBody {
	public required JsonElement Id { get; set; }
	public required JsonElement Token { get; set; }
	public required JsonElement NewPassword { get; set; }
	public required JsonElement ConfirmPassword { get; set; }

	public string GetId() {
		return Id.ValueKind switch {
			JsonValueKind.String => Id.GetString() ?? throw new InvalidOperationException("ID cannot be null"),
			_ => throw new InvalidOperationException("Invalid ID format")
		};
	}

	public string GetToken() {
		return Token.ValueKind switch {
			JsonValueKind.String => Token.GetString() ?? throw new InvalidOperationException("Token cannot be null"),
			_ => throw new InvalidOperationException("Invalid token format")
		};
	}

	public string GetNewPassword() {
		return NewPassword.ValueKind switch {
			JsonValueKind.String => NewPassword.GetString() ?? throw new InvalidOperationException("Password cannot be null"),
			_ => throw new InvalidOperationException("Invalid password format")
		};
	}

	public string GetConfirmPassword() {
		return ConfirmPassword.ValueKind switch {
			JsonValueKind.String => ConfirmPassword.GetString() ?? throw new InvalidOperationException("Confirm password cannot be null"),
			_ => throw new InvalidOperationException("Invalid confirm password format")
		};
	}
}

public class ResetPasswordBodyValidator : AbstractValidator<ResetPasswordBody> {
	public ResetPasswordBodyValidator(IOptions<AppSettings> appSettings) {
		RuleFor(x => x.Id)
			.NotEmpty().WithMessage("ID is required")
			.DependentRules(() => {
				RuleFor(x => x.Id)
					.Must(id => id.ValueKind == JsonValueKind.String).WithMessage("ID must be a string")
					.DependentRules(() => {
						RuleFor(x => x.Id.GetString()!)
							.Must(id => CryptoUtils.IsValidEncryptedString(id)).WithMessage("Invalid ID format");
					});
			});

		RuleFor(x => x.Token)
			.NotEmpty().WithMessage("Token is required")
			.DependentRules(() => {
				RuleFor(x => x.Token)
					.Must(token => token.ValueKind == JsonValueKind.String).WithMessage("Token must be a string");
			});

		RuleFor(x => x.NewPassword)
			.NotEmpty().WithMessage("New password is required")
			.DependentRules(() => {
				RuleFor(x => x.NewPassword)
					.Must(password => password.ValueKind == JsonValueKind.String).WithMessage("Password must be a string")
					.DependentRules(() => {
						RuleFor(x => x.NewPassword.GetString()!)
							.MinimumLength(appSettings.Value.PASSWORD_MIN_LENGTH)
							.WithMessage($"Password must be at least {appSettings.Value.PASSWORD_MIN_LENGTH} characters long");
					});
			});

		RuleFor(x => x.ConfirmPassword)
			.NotEmpty().WithMessage("Confirm password is required")
			.DependentRules(() => {
				RuleFor(x => x.ConfirmPassword)
					.Must(password => password.ValueKind == JsonValueKind.String).WithMessage("Confirm password must be a string");
			});

		// Cross-field validation: passwords must match
		RuleFor(x => x)
			.Must(body => {
				if (body.NewPassword.ValueKind == JsonValueKind.String && body.ConfirmPassword.ValueKind == JsonValueKind.String) {
					return body.GetNewPassword() == body.GetConfirmPassword();
				}
				return true; // Skip if not both strings (will be caught by other validators)
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
			BadRequest<ApiResponse>
		>
	> HandleResetPassword(
		[FromBody] ResetPasswordBody body,
		[FromServices] IUserService userService,
		[FromServices] IPasswordService passwordService,
		CancellationToken cancellationToken = default
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
			return TypedResults.BadRequest(ApiResponse.Create(
				"Invalid or expired password reset token",
				ResponseKeys.InvalidPasswordResetToken
			));
		}

		// Query user by email and password reset token
		var user = await userService.GetUserByEmailAndPasswordResetTokenAsync(email, token, cancellationToken);

		if (user is null) {
			return TypedResults.BadRequest(ApiResponse.Create(
				"Invalid or expired password reset token",
				ResponseKeys.InvalidPasswordResetToken
			));
		}

		// Check if token is expired
		if (user.PasswordResetTokenExpiresAt.HasValue && DateTime.UtcNow > user.PasswordResetTokenExpiresAt.Value) {
			return TypedResults.BadRequest(ApiResponse.Create(
				"Invalid or expired password reset token",
				ResponseKeys.InvalidPasswordResetToken
			));
		}

		// Hash new password
		var hashedPassword = passwordService.HashPassword(newPassword);

		// Update user
		user.Password = hashedPassword;
		user.PasswordResetToken = null;
		user.PasswordResetTokenExpiresAt = null;

		await userService.UpdateUserAsync(user, cancellationToken);

		return TypedResults.Ok(new ResetPasswordResult {
			Status = "success"
		});
	}
}

