using System.Text.Json;
using FluentValidation;
using MainApi.Src.Features.Common.Session;
using MainApi.Src.Features.Common.User;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Features.Common.Auth.Handlers.PasswordLogin;

public class PasswordLoginBody
{
	// public string Email { get; set; } = string.Empty;
	// public string Password { get; set; } = string.Empty;
	public JsonElement Email { get; set; }
	public JsonElement Password { get; set; }

	public string GetPassword()
	{
		return Password.ValueKind switch
		{
			JsonValueKind.String => Password.GetString() ?? throw new InvalidOperationException("Password cannot be null"),
			JsonValueKind.Number => Password.GetRawText(),
			_ => throw new InvalidOperationException("Invalid password format")
		};
	}

	public string GetEmail()
	{
		return Email.ValueKind switch
		{
			JsonValueKind.String => Email.GetString() ?? throw new InvalidOperationException("Email cannot be null"),
			JsonValueKind.Number => Email.GetRawText(),
			_ => throw new InvalidOperationException("Invalid email format")
		};
	}
}

public class PasswordLoginBodyValidator : AbstractValidator<PasswordLoginBody>
{
	public PasswordLoginBodyValidator()
	{
		// RuleFor(x => x.Email)
		// 	.NotEmpty().WithMessage("Email is required")
		// 	.EmailAddress().WithMessage("Invalid email address");

		// RuleFor(x => x.Password)
		// 	.NotEmpty().WithMessage("Password is required")
		// 	.MinimumLength(6).WithMessage("Password must be at least 6 characters long");

		RuleFor(x => x.Email)
			.NotEmpty().WithMessage("Email is required")
			.DependentRules(() =>
			{
				RuleFor(x => x.Email)
					.Must(email => email.ValueKind == JsonValueKind.String).WithMessage("Email must be a string")
					.DependentRules(() =>
					{
						RuleFor(x => x.Email.GetString()!)
							.EmailAddress().WithMessage("Invalid email address");
					});
			});

		RuleFor(x => x.Password)
			.NotEmpty().WithMessage("Password is required")
			.DependentRules(() =>
			{
				RuleFor(x => x.Password)
					.Must(password => password.ValueKind == JsonValueKind.String).WithMessage("Password must be a string")
					.DependentRules(() =>
					{
						RuleFor(x => x.Password.GetString()!)
							.MinimumLength(6).WithMessage("Password must be at least 6 characters long");
					});
			});
	}
}

public class PasswordLoginSuccessResultDto
{
	public required string Message { get; set; }
	public required string Key { get; set; }
	public required object SessionToken { get; set; }
}

public static class PasswordLogin
{
	public static async Task<IResult> HandlePasswordLogin(
		[FromBody] PasswordLoginBody loginBody,
		[FromServices] IUserService userService,
		[FromServices] ISessionService sessionService,
		[FromServices] IPasswordService passwordService
	)
	{
		// Get validated string values
		string email = loginBody.GetEmail();
		string password = loginBody.GetPassword();

		var user = await userService.GetUserToLogin(email);

		if (user == null)
		{
			return TypedResults.BadRequest(new { message = "Invalid email or password", key = "invalid-email-or-password" });
		}

		if (user.IsDeleted == true)
		{
			return TypedResults.BadRequest(new { message = "Invalid email or password", key = "invalid-email-or-password" });
		}

		if (user.IsSuspended == true)
		{
			return TypedResults.BadRequest(new { message = "User is suspended", key = "user-suspended" });
		}

		if (user.IsVerified != true)
		{
			return TypedResults.BadRequest(new { message = "User is not verified", key = "user-not-verified" });
		}

		// Verify the password
		if (!passwordService.VerifyPassword(password, user.Password))
		{
			return TypedResults.BadRequest(new { message = "Invalid email or password", key = "invalid-email-or-password" });
		}

		var createSessionResult = await sessionService.CreateSessionForUser(user);

		if (createSessionResult is CreateSessionResult.Success success)
		{
			return TypedResults.Ok(new PasswordLoginSuccessResultDto
			{
				Message = "Login successful",
				Key = "login-successful",
				SessionToken = success.Session.Token,
				// authData = new
				// {
				// 	userId = user.Id,
				// 	sessionExpiresAt = success.Session.ExpiresAt,
				// 	sessionExpiresInMs = success.Session.ExpiresAt.HasValue
				// 		? (success.Session.ExpiresAt.Value - DateTime.UtcNow).TotalMilliseconds
				// 		: 0
				// }
			});
		}

		if (createSessionResult is CreateSessionResult.Failure failure)
		{
			return TypedResults.BadRequest(new
			{
				message = failure.Message,
				key = failure.Key
			});
		}

		// This should never happen with proper discriminated unions, but good to have as fallback
		return TypedResults.BadRequest(new
		{
			message = "Unknown session creation result",
			key = "unknown-session-creation-result"
		});
	}
}
