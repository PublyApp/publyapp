using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Auth.Utils;
using MainApi.Src.Modules.Users.Entities;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace MainApi.Src.Modules.Auth.Handlers;

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
		AppBadRequestHttpResult
	>> HandlePasswordRegister(
		[FromBody] PasswordRegisterBody body,
		[FromServices] IUserService userService,
		CancellationToken cancellationToken
	) {
		var email = body.GetEmail();
		var password = body.GetPassword();

		// hash the password
		password = PasswordUtils.HashPassword(password);

		var newUser = new User {
			Email = email,
			Password = password,
		};

		var createUserResult = await userService.CreateUserAsync(newUser, cancellationToken);

		if (createUserResult is CreateUserResult.UserAlreadyExists) {
			return TypedProblems.BadRequest(
				"User already exists",
				ResponseKeys.UserAlreadyExists
			);
		}

		if (createUserResult is CreateUserResult.Success success) {
			return TypedResults.Ok(new PasswordRegisterResult {
				Id = success.User.GetRequiredId(),
				Email = success.User.Email,
				CreatedAt = success.User.CreatedAt,
				UpdatedAt = success.User.UpdatedAt,
			});
		}

		return TypedProblems.BadRequest(
			"Failed to register user",
			ResponseKeys.FailedToRegisterUser
		);
	}
}
