using System.Text.Json;
using FluentValidation;
using MainApi.Localization;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace MainApi.Src.Features.Common.Auth.Handlers;

public class PasswordRegisterBody : PasswordLoginBody {
}

public class PasswordRegisterBodyValidator : AbstractValidator<PasswordRegisterBody> {
	public PasswordRegisterBodyValidator(IOptions<AppSettings> appSettings) {
		RuleFor(x => x.Email)
			.NotEmpty().WithMessage("Email is required")
			.DependentRules(() => {
				RuleFor(x => x.Email)
					.Must(email => email.ValueKind == JsonValueKind.String).WithMessage("mail must be a string")
					.DependentRules(() => {
						RuleFor(x => x.Email.GetString()!)
							.EmailAddress().WithMessage("Invalid email address");
					});
			});

		RuleFor(x => x.Password)
			.NotEmpty().WithMessage("Password is required")
			.DependentRules(() => {
				RuleFor(x => x.Password)
					.Must(password => password.ValueKind == JsonValueKind.String)
					.WithMessage("Password must be a string")
					.DependentRules(() => {
						RuleFor(x => x.Password.GetString()!)
							.MinimumLength(appSettings.Value.PASSWORD_MIN_LENGTH)
							.WithMessage("Password must be at least 6 characters long");
					});
			});
	}
}

public class PasswordRegisterResult {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
	public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public static class PasswordRegister {
	public static async Task<Results<
	Ok<PasswordRegisterResult>,
	BadRequest<ApiResponse>
	>> HandlePasswordRegister(
		[FromBody] PasswordRegisterBody registerBody,
		[FromServices] IUserService userService,
		[FromServices] IPasswordService passwordService,
		CancellationToken cancellationToken
) {
		var email = registerBody.GetEmail();
		var password = registerBody.GetPassword();

		// hash the password
		password = passwordService.HashPassword(password);

		var newUser = new MainApi.Src.Features.Common.User.User {
			Email = email,
			Password = password,
		};

		var createUserResult = await userService.CreateUserAsync(newUser, cancellationToken);

		if (createUserResult is CreateUserResult.UserAlreadyExists) {
			return TypedResults.BadRequest(ApiResponse.Create(
				"User already exists",
				ResponseKeys.UserAlreadyExists
			));
		}

		if (createUserResult is CreateUserResult.Success success) {
			return TypedResults.Ok(new PasswordRegisterResult {
				Id = success.User.Id,
				Email = success.User.Email,
				CreatedAt = success.User.CreatedAt,
				UpdatedAt = success.User.UpdatedAt,
			});
		}

		return TypedResults.BadRequest(ApiResponse.Create(
			"Failed to register user",
			ResponseKeys.FailedToRegisterUser
		));
	}
}
