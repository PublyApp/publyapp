using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Features.Common.Auth;

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
	public static async Task<IResult> LoginWithEmailAndPassword([FromBody] LoginWithEmailAndPasswordDto dto)
#pragma warning restore CS1998 // Async method lacks 'await' operators and will run synchronously
	{
			return Results.Ok(new { message = "Login successful" });
		}

#pragma warning disable CS1998 // Async method lacks 'await' operators and will run synchronously
	public static async Task<IResult> RegisterWithEmailAndPassword([FromBody] RegisterWithEmailAndPasswordDto dto)
#pragma warning restore CS1998 // Async method lacks 'await' operators and will run synchronously
		{
			return Results.Ok(new { message = "Register successful" });
		}
}
