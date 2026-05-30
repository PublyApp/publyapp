using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Auth.Services;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Auth.Handlers;

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

		if (user.IsDeleted) {
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

		if (!user.IsVerified) {
			return TypedProblems.BadRequest(
				"User is not verified",
				ResponseKeys.UserNotVerified
			);
		}

		// Verify the password
		if (!PasswordUtils.VerifyPassword(password, user.Password)) {
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
