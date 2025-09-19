namespace MainApi.Src.Features.Common.Auth.Handlers.PasswordRegister;

using System.Text.Json;
using FluentValidation;
using MainApi.Localization;
using MainApi.Src.Features.Common.Auth.Handlers.PasswordLogin;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

public class PasswordRegisterBody : PasswordLoginBody {
}

public class PasswordRegisterBodyValidator : AbstractValidator<PasswordRegisterBody> {
	public PasswordRegisterBodyValidator() {
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
					.Must(password => password.ValueKind == JsonValueKind.String).WithMessage("Password must be a string")
					.DependentRules(() => {
						RuleFor(x => x.Password.GetString()!)
							.MinimumLength(6).WithMessage("Password must be at least 6 characters long");
					});
			});
	}
}

public class PasswordRegisterResultUser {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
	public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class PasswordRegisterSuccessResult {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
	public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public static class PasswordRegister {
	public static async Task<Results<
	Ok<PasswordRegisterSuccessResult>,
	BadRequest<ApiResponse>
	>> HandlePasswordRegister(
		[FromBody] PasswordRegisterBody registerBody,
		[FromServices] IUserService userService,
		CancellationToken cancellationToken = default
) {
		var email = registerBody.GetEmail();
		var password = registerBody.GetPassword();

		var newUser = new User {
			Email = email,
			Password = password,
		};

		var createUserResult = await userService.CreateUserAsync(newUser, cancellationToken);

		if (createUserResult is CreateUserResult.Failure failure) {
			return TypedResults.BadRequest(ApiResponse.Create(failure.Message, failure.Key));
		}

		if (createUserResult is CreateUserResult.Success success) {
			return TypedResults.Ok(new PasswordRegisterSuccessResult {
				Id = success.User.Id,
				Email = success.User.Email,
				CreatedAt = success.User.CreatedAt,
				UpdatedAt = success.User.UpdatedAt,
			});
		}

		// This should never happen with proper discriminated unions
		// but good to have as fallback
		return TypedResults.BadRequest(ApiResponse.Create("Failed to register user", ResponseKeys.FailedToRegisterUser));
	}
}
