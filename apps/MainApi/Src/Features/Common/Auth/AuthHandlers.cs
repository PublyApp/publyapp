namespace MainApi.Src.Features.Common.Auth;

using MainApi.Src.Data.DbContext;
using Microsoft.AspNetCore.Mvc;
using MainApi.Src.Features.Common.User;
using MongoDB.Bson;
using Microsoft.EntityFrameworkCore;

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
	public static async Task<IResult> LoginWithEmailAndPassword([FromBody] LoginWithEmailAndPasswordDto user)
#pragma warning restore CS1998 // Async method lacks 'await' operators and will run synchronously
	{
			return Results.Ok(new { message = "Login successful" });
		}

#pragma warning disable CS1998 // Async method lacks 'await' operators and will run synchronously
	public static async Task<IResult> RegisterWithEmailAndPassword([FromBody] RegisterWithEmailAndPasswordDto user, [FromServices] MainApiDbContext dbContext)
#pragma warning restore CS1998 // Async method lacks 'await' operators and will run synchronously
		{
			// TODO: add dto validation (using FluentValidation)

			// basic validation
			if (string.IsNullOrEmpty(user.Email) || string.IsNullOrEmpty(user.Password))
			{
				return Results.BadRequest(new { message = "Email and password are required" });
			}

			// check if user already exists
			var existingUser = await dbContext.User.FirstOrDefaultAsync(u => u.Email == user.Email);
			if (existingUser != null)
			{
				return Results.BadRequest(new { message = "User already exists" });
			}

			var newUser = new User
			{
				Email = user.Email,
				Password = user.Password,
			};

			var result = await dbContext.User.AddAsync(newUser);
			await dbContext.SaveChangesAsync();

			return Results.Json(new { message = "Register successful", user = result.ToJson() }, statusCode: StatusCodes.Status201Created);
		}
}
