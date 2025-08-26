namespace MainApi.Src.Features.Common.Auth.Handlers.PasswordRegister;

using System.Text.Json;
using FluentValidation;
using MainApi.Src.Features.Common.Auth.Handlers.PasswordLogin;
using MainApi.Src.Features.Common.User;
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

public class PasswordRegisterSuccessResultDto
{
	public required string Message { get; set; }
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

		if (createUserResult is CreateUserResult.Success success)
		{
			return Results.Json(new
			{
				message = "Registration successful",
				key = "registration-successful",
				user = success.User
			}, statusCode: StatusCodes.Status201Created);
		}

		if (createUserResult is CreateUserResult.Failure failure)
		{
			return Results.BadRequest(new
			{
				message = failure.Message,
				key = failure.Key
			});
		}

		// This should never happen with proper discriminated unions, but good to have as fallback
		return Results.BadRequest(new
		{
			message = "Unknown user creation result",
			key = "unknown-user-creation-result"
		});
	}
}
