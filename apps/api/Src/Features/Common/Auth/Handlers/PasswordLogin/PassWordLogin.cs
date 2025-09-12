using System.Text.Json;
using FluentValidation;
using MainApi.Localization;
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
			_ => throw new InvalidOperationException("Invalid password format")
		};
	}

	public string GetEmail()
	{
		return Email.ValueKind switch
		{
			JsonValueKind.String => Email.GetString() ?? throw new InvalidOperationException("Email cannot be null"),
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


public class PasswordLoginSuccessResult
{
	public Guid UserId { get; set; }
	public string SessionToken { get; set; } = string.Empty;
	public DateTime SessionExpiresAt { get; set; }
	public double SessionExpiresInMs { get; set; }
}

public class PasswordLogin
{
	public static async Task<Results<
	Ok<PasswordLoginSuccessResult>,
	BadRequest<ApiResponse>
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

		var user = await userService.GetUserToLoginAsync(email);


		if (user == null)
		{
			return TypedResults.BadRequest(ApiResponse.Create("Invalid email or password", ResponseKeys.InvalidEmailOrPassword));
		}

		if (user.IsDeleted == true)
		{
			return TypedResults.BadRequest(ApiResponse.Create("Invalid email or password", ResponseKeys.InvalidEmailOrPassword));
		}

		if (user.IsSuspended == true)
		{
			return TypedResults.BadRequest(ApiResponse.Create("User is suspended", ResponseKeys.UserSuspended));
		}

		if (user.IsVerified != true)
		{
			return TypedResults.BadRequest(ApiResponse.Create("User is not verified", ResponseKeys.UserNotVerified));
		}

		// Verify the password
		if (!passwordService.VerifyPassword(password, user.Password ?? string.Empty))
		{
			return TypedResults.BadRequest(ApiResponse.Create("Invalid email or password", ResponseKeys.InvalidEmailOrPassword));
		}

		var createSessionResult = await sessionService.CreateSessionForUser(user);

		if (createSessionResult is CreateSessionResult.Success success)
		{
			return TypedResults.Ok(new PasswordLoginSuccessResult
			{
				UserId = user.Id,
				SessionToken = success.Session.Token ?? throw new Exception("Token is null"),
				SessionExpiresAt = success.Session.ExpiresAt,
				SessionExpiresInMs = (success.Session.ExpiresAt - DateTime.UtcNow).TotalMilliseconds
			});
		}

		if (createSessionResult is CreateSessionResult.Failure failure)
		{
			return TypedResults.BadRequest(ApiResponse.Create(failure.Message, failure.Key));
		}

		// This should never happen with proper discriminated unions
		// but good to have as fallback
		return TypedResults.BadRequest(ApiResponse.Create("Failed to login", ResponseKeys.FailedToLogin));
	}
}
