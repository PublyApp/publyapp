using FluentValidation;

using MainApi.Localization;
using MainApi.Lib.ProblemResults;
using MainApi.Lib.Validation;
using MainApi.Modules.Auth.Utils;
using MainApi.Modules.Users.Entities;
using MainApi.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Modules.Auth.Handlers;

public class PasswordRegisterBody : PasswordLoginBody {
}

public class PasswordRegisterBodyValidator
	: AbstractValidator<PasswordRegisterBody> {
	public PasswordRegisterBodyValidator() {
		RuleFor(x => x.Email)
			.MustBeRequiredEmail();

		RuleFor(x => x.Password)
			.MustBeRequiredPassword();
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
