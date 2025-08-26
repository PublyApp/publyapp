namespace MainApi.Src.Features.Common.Auth.Handlers.PasswordRegister;

using System.Text.Json;
using FluentValidation;
using MainApi.Src.Features.Common.Auth.Handlers.PasswordLogin;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Lib;
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

public class PasswordRegisterApiResponseUser
{
	public string Id { get; set; } = string.Empty;
	public string Email { get; set; } = string.Empty;
	public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
	public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class PasswordRegisterSuccessApiResponse : AppResponseResult
{
	public required PasswordRegisterApiResponseUser User { get; set; }
}

public class PasswordRegisterSuccessResponseResult : AppResponseResult
{
	public new string Message { get; set; } = "Registration successful";
	public new string Key { get; set; } = "registration-successful";

	public required User User { get; set; }

	public PasswordRegisterSuccessApiResponse GetApiResponse()
	{
		return new PasswordRegisterSuccessApiResponse
		{
			Message = Message,
			Key = Key,
			User = new PasswordRegisterApiResponseUser
			{
				Id = User.Id,
				Email = User.Email,
				CreatedAt = User.CreatedAt,
				UpdatedAt = User.UpdatedAt,
			}
		};
	}
}

public class PasswordRegisterFailResponseResult : AppResponseResult
{
	public new string Message { get; set; } = "Failed to register user";
	public new string Key { get; set; } = "failed-to-register-user";
}

public class CreateUserFailResponseResult : PasswordRegisterFailResponseResult
{
}

public static class PasswordRegister
{
	public static async Task<IResult> HandlePasswordRegister(
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
			var failResult = new CreateUserFailResponseResult
			{
				Message = failure.Message,
				Key = failure.Key
			};
			return TypedResults.BadRequest(failResult);
		}

		if (createUserResult is CreateUserResult.Success success)
		{
			var successResult = new PasswordRegisterSuccessResponseResult
			{
				User = success.User
			};
			return TypedResults.Ok(successResult.GetApiResponse());
		}

		// This should never happen with proper discriminated unions
		// but good to have as fallback
		return TypedResults.BadRequest(new PasswordRegisterFailResponseResult
		{
		});
	}
}
