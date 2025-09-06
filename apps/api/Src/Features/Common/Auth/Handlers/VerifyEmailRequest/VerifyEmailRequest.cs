namespace MainApi.Src.Features.Common.Auth.Handlers.VerifyEmailRequest;

using FluentValidation;
using MainApi.Localization;
using MainApi.Src.Features.Common.Email;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

public class VerifyEmailRequestBody
{
	public required JsonElement Email { get; set; }

	public string GetEmail()
	{
		return Email.ValueKind switch
		{
			JsonValueKind.String => Email.GetString() ?? throw new InvalidOperationException("Email cannot be null"),
			_ => throw new InvalidOperationException("Invalid email format")
		};
	}
}

public class VerifyEmailRequestBodyValidator : AbstractValidator<VerifyEmailRequestBody>
{
	public VerifyEmailRequestBodyValidator()
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
	}
}



public class VerifyEmailRequestSuccessResult : AppResponseResult
{
}

public class VerifyEmailRequest
{
	public static async Task<
	Results<Ok<VerifyEmailRequestSuccessResult>,
	BadRequest<ApiResponse>>
	> HandleVerifyEmailRequest(
		[FromBody] VerifyEmailRequestBody body,
		[FromServices] IUserService userService,
		[FromServices] IEmailService emailService
	)
	{
		// check if user exists
		var user = await userService.GetUserByEmail(body.GetEmail());

		if (user == null)
		{
			return TypedResults.BadRequest(ApiResponse.Create("User not found", ResponseKeys.UserNotFound));
		}

		if (user.IsVerified == true)
		{
			return TypedResults.BadRequest(ApiResponse.Create("Email already verified", ResponseKeys.EmailAlreadyVerified));
		}

		var userEmail = user.Email ?? throw new Exception("User email is null");

		// if the token is valid, reuse it and send email
		if (!string.IsNullOrEmpty(user.EmailVerifyToken)
		&& (DateTime.UtcNow < (user.EmailVerifyTokenExpiresAt ?? DateTime.MinValue)))
		{
			await emailService.SendEmail(userEmail, "Email Verification", "Please verify your email by clicking the link below: " + user.EmailVerifyToken);
		}

		return TypedResults.Ok(new VerifyEmailRequestSuccessResult());
	}
}
