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

public class RegisterWithEmailAndPasswordDto: LoginWithEmailAndPasswordDto
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
				return Results.BadRequest(new { message = "Validation failed", key = "validation-failed",
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

#pragma warning disable IDE0042 // Deconstruct variable declaration
		var sessionResult = await sessionService.CreateSessionForUser(user);
#pragma warning restore IDE0042 // Deconstruct variable declaration

		if (!sessionResult.success)
			{
				return Results.BadRequest(new { message = sessionResult.message, key = sessionResult.key });
			}

			return Results.Ok(new { message = "Login successful", key = "login-successful", user, session = sessionResult.session });
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
				return Results.BadRequest(new { message = "Validation failed", key = "validation-failed",
					errors = validationResult.Errors.Select(e => e.ErrorMessage).ToArray()
					});
			}

			var newUser = new User
			{
				Email = userDto.Email,
				Password = userDto.Password,
			};

#pragma warning disable IDE0042 // Deconstruct variable declaration
		var userResult = await userService.CreateUser(newUser);
#pragma warning restore IDE0042 // Deconstruct variable declaration

		if (!userResult.success)
			{
				return Results.BadRequest(new { message = userResult.message, key = userResult.key });
			}

			// Don't return the user object with hashed password
			return Results.Json(new { message = "Registration successful", key = "registration-successful", user = userResult.user }, statusCode: StatusCodes.Status201Created);
		}
}
