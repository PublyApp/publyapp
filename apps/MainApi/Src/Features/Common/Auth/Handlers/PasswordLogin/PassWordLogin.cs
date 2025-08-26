using System.Text.Json;
using FluentValidation;
using MainApi.Src.Features.Common.Session;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Features.Common.Auth.Handlers.PasswordLogin;

using User = MainApi.Src.Features.Common.User.User;
using Session = MainApi.Src.Features.Common.Session.Session;

public class PasswordLoginBody
{
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

public class PasswordLoginSuccessResponseResult : AppResponseResult
{
	public new string Message { get; set; } = "Login successful";
	public new string Key { get; set; } = "login-successful";
	public required User User { get; set; }

	public required Session Session { get; set; }

	public object GetApiResponse()
	{
		return new
		{
			message = Message,
			key = Key,
			authData = new
			{
				userId = User.Id,
				sessionExpiresAt = User.CreatedAt,
				sessionExpiresInMs = User.CreatedAt.HasValue
					? (User.CreatedAt.Value - DateTime.UtcNow).TotalMilliseconds
					: 0
			}
		};
	}
}

public class PasswordLoginFailResponseResult : AppResponseResult
{
	public new string Message { get; set; } = "Failed to login";
	public new string Key { get; set; } = "failed-to-login";
}

public class PasswordLoginInvalidEmailOrPasswordResponseResult : PasswordLoginFailResponseResult
{
	public new string Message { get; set; } = "Invalid email or password";
	public new string Key { get; set; } = "invalid-email-or-password";
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

		var invalidEmailOrPasswordResult = new PasswordLoginInvalidEmailOrPasswordResponseResult();

		if (user.IsDeleted == true)
		{
			return TypedResults.BadRequest(invalidEmailOrPasswordResult);
		}

		if (user.IsSuspended == true)
		{
			return TypedResults.BadRequest(new PasswordLoginFailResponseResult { Message = "User is suspended", Key = "user-suspended" });
		}

		if (user.IsVerified != true)
		{
			return TypedResults.BadRequest(new PasswordLoginFailResponseResult { Message = "User is not verified", Key = "user-not-verified" });
		}

		// Verify the password
		if (!passwordService.VerifyPassword(password, user.Password))
		{
			return TypedResults.BadRequest(invalidEmailOrPasswordResult);
		}

		var createSessionResult = await sessionService.CreateSessionForUser(user);

		if (createSessionResult is CreateSessionResult.Success success)
		{
			var successResult = new PasswordLoginSuccessResponseResult
			{
				User = user,
				Session = success.Session,
			};
			return TypedResults.Ok(successResult.GetApiResponse());
		}

		if (createSessionResult is CreateSessionResult.Failure failure)
		{
			return TypedResults.BadRequest(new
			{
				message = failure.Message,
				key = failure.Key
			});
		}

		// This should never happen with proper discriminated unions
		// but good to have as fallback
		return TypedResults.BadRequest(new PasswordLoginFailResponseResult { });
	}
}
