using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Users.Entities;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Auth.Handlers;

public class PasswordRegisterBody : PasswordLoginBody {
	public JsonElement FirstName { get; set; }
	public JsonElement LastName { get; set; }

	public string GetFirstName() {
		return FirstName.GetValueAsString().Trim();
	}

	public string GetLastName() {
		return LastName.GetValueAsString().Trim();
	}
}

public class PasswordRegisterBodyValidator
	: AbstractValidator<PasswordRegisterBody> {
	public PasswordRegisterBodyValidator() {
		RuleFor(x => x.Email)
			.MustBeRequiredEmail();

		RuleFor(x => x.Password)
			.MustBeRequiredPassword();

		RuleFor(x => x.FirstName)
			.MustBeRequiredStringWithLength("FirstName", 1, 100, trim: true);

		RuleFor(x => x.LastName)
			.MustBeRequiredStringWithLength("LastName", 1, 100, trim: true);
	}
}

public class PasswordRegisterResult {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
	public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class PasswordRegister {
	public static async Task<Results<
		Ok<PasswordRegisterResult>,
		AppBadRequestHttpResult
	>> Handle(
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
			FirstName = body.GetFirstName(),
			LastName = body.GetLastName(),
			// Password registration owns credential setup, so it opts into activation
			// instead of relying on the User entity's safe suspended default.
			Status = UserStatus.Active,
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
