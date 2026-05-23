using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Lib.Extensions;
using MainApi.Lib.ProblemResults;
using MainApi.Lib.Validation;
using MainApi.Modules.Auth.Services;
using MainApi.Modules.Auth.Utils;
using MainApi.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Modules.Auth.Handlers;

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

public class PasswordLoginBodyValidator
	: AbstractValidator<PasswordLoginBody> {
	public PasswordLoginBodyValidator() {
		RuleFor(x => x.Email)
			.MustBeRequiredEmail();

		RuleFor(x => x.Password)
			.MustBeRequiredPassword();
	}
}

public class PasswordLoginResult {
	public Guid UserId { get; set; }
	public string SessionToken { get; set; } = string.Empty;
	public DateTime SessionExpiresAt { get; set; }
	public double SessionExpiresInMs { get; set; }
}

public sealed class PasswordLogin {
	public static async Task<Results<
		Ok<PasswordLoginResult>,
		AppBadRequestHttpResult
	>> Handle(
		[FromBody] PasswordLoginBody body,
		[FromServices] IUserService userService,
		[FromServices] ISessionService sessionService,
		CancellationToken cancellationToken
	) {
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

		if (user.IsSuspended()) {
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
