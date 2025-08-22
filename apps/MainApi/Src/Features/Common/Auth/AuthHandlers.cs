namespace MainApi.Src.Features.Common.Auth;

using Microsoft.AspNetCore.Mvc;
using MainApi.Src.Features.Common.User;
using FluentValidation;
using MainApi.Src.Features.Common.Session;

public class LoginWithEmailAndPasswordDto
{
	public string Email { get; set; } = string.Empty;
	public string Password { get; set; } = string.Empty;
}

public class RegisterWithEmailAndPasswordDto : LoginWithEmailAndPasswordDto
{
}

public static class AuthHandlers
{
#pragma warning disable CS1998 // Async method lacks 'await' operators and will run synchronously
	public static async Task<IResult> LoginWithEmailAndPassword([FromBody] LoginWithEmailAndPasswordDto userDto, [FromServices] IUserService userService, [FromServices] ISessionService sessionService, [FromServices] IValidator<LoginWithEmailAndPasswordDto> validator, [FromServices] IPasswordService passwordService)
#pragma warning restore CS1998 // Async method lacks 'await' operators and will run synchronously
	{
		// FluentValidation handles all validation, including null checks
		var validationResult = await validator.ValidateAsync(userDto);
		if (!validationResult.IsValid)
		{
			return Results.BadRequest(new
			{
				message = "Validation failed",
				key = "validation-failed",
				errors = validationResult.Errors.Select(e => e.ErrorMessage).ToArray()
			});
		}

		var user = await userService.GetUserByEmail(userDto.Email);
		if (user == null)
		{
			return Results.BadRequest(new { message = "Invalid email or password", key = "invalid-email-or-password" });
		}

		// Verify the password
		if (!passwordService.VerifyPassword(userDto.Password, user.Password))
		{
			return Results.BadRequest(new { message = "Invalid email or password", key = "invalid-email-or-password" });
		}

		var createSessionResult = await sessionService.CreateSessionForUser(user);

		if (createSessionResult is CreateSessionResult.Success success)
		{
			return Results.Ok(new
			{
				message = "Login successful",
				key = "login-successful",
				authData = new
				{
					userId = user.Id,
					sessionToken = success.Session.Token,
					sessionExpiresAt = success.Session.ExpiresAt,
					sessionExpiresInMs = success.Session.ExpiresAt.HasValue
						? (success.Session.ExpiresAt.Value - DateTime.UtcNow).TotalMilliseconds
						: 0
				}
			});
		}

		if (createSessionResult is CreateSessionResult.Failure failure)
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
			message = "Unknown session creation result",
			key = "unknown-session-creation-result"
		});
	}

#pragma warning disable CS1998 // Async method lacks 'await' operators and will run synchronously
	public static async Task<IResult> RegisterWithEmailAndPassword([FromBody] RegisterWithEmailAndPasswordDto userDto, [FromServices] IValidator<RegisterWithEmailAndPasswordDto> validator, [FromServices] IUserService userService)
#pragma warning restore CS1998 // Async method lacks 'await' operators and will run synchronously
	{
		// FluentValidation handles all validation, including null checks and field validation
		// var validator = new RegisterWithEmailAndPasswordDtoValidator();
		var validationResult = await validator.ValidateAsync(userDto);
		if (!validationResult.IsValid)
		{
			return Results.BadRequest(new
			{
				message = "Validation failed",
				key = "validation-failed",
				errors = validationResult.Errors.Select(e => e.ErrorMessage).ToArray()
			});
		}

		var newUser = new User
		{
			Email = userDto.Email,
			Password = userDto.Password,
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
