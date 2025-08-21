namespace MainApi.Src.Features.Common.Auth;

using MainApi.Src.Data.DbContext;
using Microsoft.AspNetCore.Mvc;
using MainApi.Src.Features.Common.User;
using MongoDB.Bson;
using Microsoft.EntityFrameworkCore;
using FluentValidation;

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
	public static async Task<IResult> LoginWithEmailAndPassword([FromBody] LoginWithEmailAndPasswordDto userDto)
#pragma warning restore CS1998 // Async method lacks 'await' operators and will run synchronously
	{
			// FluentValidation handles all validation, including null checks
			return Results.Ok(new { message = "Login successful", key = "login-successful" });
		}

#pragma warning disable CS1998 // Async method lacks 'await' operators and will run synchronously
	public static async Task<IResult> RegisterWithEmailAndPassword([FromBody] RegisterWithEmailAndPasswordDto userDto, [FromServices] MainApiDbContext dbContext, [FromServices] IValidator<RegisterWithEmailAndPasswordDto> validator)
#pragma warning restore CS1998 // Async method lacks 'await' operators and will run synchronously
		{
			// FluentValidation handles all validation, including null checks and field validation
			// var validator = new RegisterWithEmailAndPasswordDtoValidator();
			var validationResult = await validator.ValidateAsync(userDto);
			if (!validationResult.IsValid)
			{
				return Results.BadRequest(new { message = "Validation failed", key = "validation-failed",
					errors = validationResult.Errors.Select(e => e.ErrorMessage).ToArray()
					// errors = validationResult.Errors
				 });
			}

			// check if user already exists
			var existingUser = await dbContext.User.FirstOrDefaultAsync(u => u.Email == userDto.Email);
			if (existingUser != null)
			{
				return Results.BadRequest(new { message = "User already exists", key = "user-already-exists" });
			}

			var newUser = new User
			{
				Email = userDto.Email,
				Password = userDto.Password,
				CreatedAt = DateTime.UtcNow,
				UpdatedAt = DateTime.UtcNow
			};

			await dbContext.User.AddAsync(newUser);
			await dbContext.SaveChangesAsync();

			return Results.Json(new { message = "Register successful", key = "register-successful", user = newUser }, statusCode: StatusCodes.Status201Created);
		}
}
