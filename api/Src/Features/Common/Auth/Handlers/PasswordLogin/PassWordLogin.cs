using System.Text.Json;
using FluentValidation;
using MainApi.Src.Features.Common.Session;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Features.Common.Auth.Handlers.PasswordLogin;

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


public class PasswordLoginSuccessResult : AppResponseResult
{
	public string UserId { get; set; } = string.Empty;
	public string SessionToken { get; set; } = string.Empty;
	public DateTime SessionExpiresAt { get; set; }
	public double SessionExpiresInMs { get; set; }
}

public static class PasswordLogin
{
	public static async Task<Results<
	Ok<PasswordLoginSuccessResult>,
	BadRequest<AppResponseResult>
	// BadRequest<PasswordLoginFailResult>,
	// BadRequest<InvalidEmailOrPasswordResult>
	>> HandlePasswordLogin(
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

		var invalidEmailOrPasswordResult = new AppResponseResult
		{
			Message = "Invalid email or password",
			Key = "invalid-email-or-password"
		};

		if (user == null)
		{
			return TypedResults.BadRequest(invalidEmailOrPasswordResult);
		}

		if (user.IsDeleted == true)
		{
			return TypedResults.BadRequest(invalidEmailOrPasswordResult);
		}

		if (user.IsSuspended == true)
		{
			return TypedResults.BadRequest(new AppResponseResult { Message = "User is suspended", Key = "user-suspended" });
		}

		if (user.IsVerified != true)
		{
			return TypedResults.BadRequest(new AppResponseResult { Message = "User is not verified", Key = "user-not-verified" });
		}

		// Verify the password
		if (!passwordService.VerifyPassword(password, user.Password ?? string.Empty))
		{
			return TypedResults.BadRequest(invalidEmailOrPasswordResult);
		}

		var createSessionResult = await sessionService.CreateSessionForUser(user);

		if (createSessionResult is CreateSessionResult.Success success)
		{
			return TypedResults.Ok(new PasswordLoginSuccessResult
			{
				UserId = user.Id ?? throw new Exception("Id is null"),
				SessionToken = success.Session.Token ?? throw new Exception("Token is null"),
				SessionExpiresAt = success.Session.ExpiresAt ?? throw new Exception("ExpiresAt is null"),
				SessionExpiresInMs = success.Session.ExpiresAt.HasValue
					? (success.Session.ExpiresAt.Value - DateTime.UtcNow).TotalMilliseconds
					: 0
			});
		}

		if (createSessionResult is CreateSessionResult.Failure failure)
		{
			return TypedResults.BadRequest(new AppResponseResult
			{
				Message = failure.Message,
				Key = failure.Key
			});
		}

		// This should never happen with proper discriminated unions
		// but good to have as fallback
		return TypedResults.BadRequest(new AppResponseResult { Message = "Failed to login", Key = "failed-to-login" });
	}
}
