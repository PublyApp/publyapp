namespace MainApi.Src.Features.Common.Auth.Handlers.PasswordRegister;

using System.Text.Json;
using FluentValidation;
using MainApi.Src.Features.Common.Auth.Handlers.PasswordLogin;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

public class PasswordRegisterBody : PasswordLoginBody
{
}

public class PasswordRegisterBodyValidator : AbstractValidator<PasswordRegisterBody>
{
	public PasswordRegisterBodyValidator()
	{
		RuleFor(x => x.Email)
			.NotEmpty().WithMessage("Email is required")
			.DependentRules(() =>
			{
				RuleFor(x => x.Email)
					.Must(email => email.ValueKind == JsonValueKind.String).WithMessage("mail must be a string")
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

public class PasswordRegisterResultUser
{
	public string Id { get; set; } = string.Empty;
	public string Email { get; set; } = string.Empty;
	public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
	public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class PasswordRegisterSuccessResult : AppResponseResult
{
	public new string Message { get; set; } = "Registration successful";
	public new string Key { get; set; } = "registration-successful";

	public PasswordRegisterResultUser User { get; set; } = new();

	public static PasswordRegisterSuccessResult GetApiResponse(User user, string? message = null, string? key = null)
	{
		var result = new PasswordRegisterSuccessResult
		{
			User = new PasswordRegisterResultUser
			{
				Id = user.Id ?? throw new Exception("Id is null"),
				Email = user.Email ?? throw new Exception("Email is null"),
				CreatedAt = user.CreatedAt ?? throw new Exception("CreatedAt is null"),
				UpdatedAt = user.UpdatedAt ?? throw new Exception("UpdatedAt is null"),
			}
		};

		if (!string.IsNullOrEmpty(message))
		{
			result.Message = message;
		}

		if (!string.IsNullOrEmpty(key))
		{
			result.Key = key;
		}

		return result;
	}
}

public class PasswordRegisterFailResult : AppResponseResult
{
	public new string Message { get; set; } = "Failed to register user";
	public new string Key { get; set; } = "failed-to-register-user";
}

public class CreateUserFailResponseResult : PasswordRegisterFailResult
{
}

public static class PasswordRegister
{
	public static async Task<Results<
	Ok<PasswordRegisterSuccessResult>,
	BadRequest<PasswordRegisterFailResult>,
	BadRequest<CreateUserFailResponseResult>
	>> HandlePasswordRegister(
		[FromBody] PasswordRegisterBody registerBody,
		[FromServices] IUserService userService
)
	{
		var email = registerBody.GetEmail();
		var password = registerBody.GetPassword();

		var newUser = new User
		{
			Email = email,
			Password = password,
		};

		var createUserResult = await userService.CreateUser(newUser);

		if (createUserResult is CreateUserResult.Failure failure)
		{
			var failureResponseResult = new CreateUserFailResponseResult
			{
				Message = failure.Message,
				Key = failure.Key
			};
			return TypedResults.BadRequest(failureResponseResult);
		}

		if (createUserResult is CreateUserResult.Success success)
		{
			return TypedResults.Ok(PasswordRegisterSuccessResult.GetApiResponse(success.User));
		}

		// This should never happen with proper discriminated unions
		// but good to have as fallback
		return TypedResults.BadRequest(new PasswordRegisterFailResult { });
	}
}
