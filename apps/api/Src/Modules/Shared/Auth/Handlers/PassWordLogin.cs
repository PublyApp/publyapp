using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Shared.Users;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Shared.Auth.Handlers;

public class PasswordLoginBody {
	public JsonElement Email { get; set; }
	public JsonElement Password { get; set; }

	public string GetPassword() {
		return Password.GetValueAsString();
	}

	public string GetEmail() {
		return Email.GetValueAsString();
	}
}

public class PasswordLoginBodyValidator : AbstractValidator<PasswordLoginBody> {
	public PasswordLoginBodyValidator() {
		RuleFor(x => x.Email)
			.NotEmpty().WithMessage("Email is required")
			.DependentRules(() => {
				RuleFor(x => x.Email)
					.Must(email => email.ValueKind == JsonValueKind.String).WithMessage("Email must be a string")
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

public class PasswordLoginResult {
	public Guid UserId { get; set; }
	public string SessionToken { get; set; } = string.Empty;
	public DateTime SessionExpiresAt { get; set; }
	public double SessionExpiresInMs { get; set; }
}

public class PasswordLogin {
	public static async Task<Results<
		Ok<PasswordLoginResult>,
		AppBadRequestHttpResult
	>> HandlePasswordLogin(
		[FromBody] PasswordLoginBody? loginBody,
		[FromServices] IUserService userService,
		[FromServices] ISessionService sessionService,
		CancellationToken cancellationToken
	) {
		var body = loginBody!;

		// Get validated string values
		string email = body.GetEmail();
		string password = body.GetPassword();

		var user = await userService.GetUserByEmailAsync(email, cancellationToken);

		if (user is null) {
			return TypedProblems.BadRequest(
				"Invalid email or password",
				ResponseKeys.InvalidEmailOrPassword
			);
		}

		if (user.IsDeleted == true) {
			return TypedProblems.BadRequest(
				"Invalid email or password",
				ResponseKeys.InvalidEmailOrPassword
			);
		}

		if (user.IsSuspended == true) {
			return TypedProblems.BadRequest(
				"User is suspended",
				ResponseKeys.UserSuspended
			);
		}

		if (user.IsVerified != true) {
			return TypedProblems.BadRequest(
				"User is not verified",
				ResponseKeys.UserNotVerified
			);
		}

		// Verify the password
		if (PasswordUtils.VerifyPassword(password, user.Password) is false) {
			return TypedProblems.BadRequest(
				"Invalid email or password",
				ResponseKeys.InvalidEmailOrPassword
			);
		}

		var session = await sessionService.CreateSessionForUser(user, cancellationToken);

		return TypedResults.Ok(new PasswordLoginResult {
			UserId = user.GetRequiredId(),
			SessionToken = session.Token,
			SessionExpiresAt = session.ExpiresAt,
			SessionExpiresInMs = (session.ExpiresAt - DateTime.UtcNow).TotalMilliseconds
		});
	}
}
