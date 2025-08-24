namespace MainApi.Src.Features.Common.Auth;

using Microsoft.AspNetCore.Mvc;
using MainApi.Src.Features.Common.User;
using FluentValidation;
using MainApi.Src.Features.Common.Session;
using System.Text.Json;

public class LoginWithEmailAndPasswordDto
{
	public JsonElement Email { get; set; }
	public JsonElement Password { get; set; }
}

public class RegisterWithEmailAndPasswordDto : LoginWithEmailAndPasswordDto
{
}

public static class AuthHandlers
{
#pragma warning disable CS1998 // Async method lacks 'await' operators and will run synchronously
	public static async Task<IResult> LoginWithEmailAndPassword([FromBody] LoginWithEmailAndPasswordDto loginDto, [FromServices] IUserService userService, [FromServices] ISessionService sessionService, [FromServices] IValidator<LoginWithEmailAndPasswordDto> validator, [FromServices] IPasswordService passwordService)
#pragma warning restore CS1998 // Async method lacks 'await' operators and will run synchronously
	{
		// FluentValidation handles all validation, including null checks
		var validationResult = await validator.ValidateAsync(loginDto);
		if (!validationResult.IsValid)
		{
			return Results.BadRequest(new
			{
				message = "Validation failed",
				key = "validation-failed",
				errors = validationResult.Errors.Select(e => e.ErrorMessage).ToArray()
			});
		}

		// Convert JsonElements to strings
		string email = loginDto.Email.ValueKind switch
		{
			JsonValueKind.String => loginDto.Email.GetString()!,
			_ => throw new Exception("Email must be a string")
		};

		string password = loginDto.Password.ValueKind switch
		{
			JsonValueKind.String => loginDto.Password.GetString()!,
			_ => throw new Exception("Password must be a string")
		};

		var user = await userService.GetUserToLogin(email);
		if (user == null)
		{
			return Results.BadRequest(new { message = "Invalid email or password", key = "invalid-email-or-password" });
		}

		if (user.IsDeleted == true)
		{
			return Results.BadRequest(new { message = "Invalid email or password", key = "invalid-email-or-password" });
		}

		if (user.IsSuspended == true)
		{
			return Results.BadRequest(new { message = "User is suspended", key = "user-suspended" });
		}

		if (user.IsVerified == false)
		{
			return Results.BadRequest(new { message = "User is not verified", key = "user-not-verified" });
		}

		// Verify the password
		if (!passwordService.VerifyPassword(password, user.Password))
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
	public static async Task<IResult> RegisterWithEmailAndPassword([FromBody] RegisterWithEmailAndPasswordDto registerDto, [FromServices] IValidator<RegisterWithEmailAndPasswordDto> validator, [FromServices] IUserService userService)
#pragma warning restore CS1998 // Async method lacks 'await' operators and will run synchronously
	{
		// FluentValidation handles all validation, including null checks and field validation
		// var validator = new RegisterWithEmailAndPasswordDtoValidator();
		var validationResult = await validator.ValidateAsync(registerDto);
		if (!validationResult.IsValid)
		{
			return Results.BadRequest(new
			{
				message = "Validation failed",
				key = "validation-failed",
				errors = validationResult.Errors.Select(e => e.ErrorMessage).ToArray()
			});
		}

		// Convert JsonElements to strings
		string email = registerDto.Email.ValueKind switch
		{
			JsonValueKind.String => registerDto.Email.GetString()!,
			_ => throw new Exception("Email must be a string")
		};

		string password = registerDto.Password.ValueKind switch
		{
			JsonValueKind.String => registerDto.Password.GetString()!,
			_ => throw new Exception("Password must be a string")
		};

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
