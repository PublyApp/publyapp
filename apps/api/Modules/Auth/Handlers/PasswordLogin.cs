using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Auth.Services;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Auth.Handlers;

public class PasswordLoginBody {
	public JsonElement Email { get; set; }
	public JsonElement Password { get; set; }

	public string GetPassword() {
		return this.Password.GetValueAsString();
	}

	public string GetEmail() {
		return this.Email.GetValueAsString();
	}
}

public class PasswordLoginBodyValidator
	: AbstractValidator<PasswordLoginBody> {
	public PasswordLoginBodyValidator() {
		this.RuleFor(x => x.Email)
			.MustBeRequiredEmail();

		this.RuleFor(x => x.Password)
			.MustBeRequiredPassword();
	}
}

/// <summary>
/// The classified cause of a failed sign-in, stored in the audit event's
/// <c>details.reason</c>. One value per branch the handler already
/// distinguishes, so the dashboard's failed-sign-in series can be explained
/// without ever storing the password or the presented token.
/// </summary>
public static class SignInFailureReasons {
	public const string UnknownAccount = "unknown_account";
	public const string WrongPassword = "wrong_password";
	public const string Deleted = "deleted";
	public const string Suspended = "suspended";
	public const string NotVerified = "not_verified";
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
		[FromServices] IAuditLogService auditLogService,
		CancellationToken cancellationToken
	) {
		// Get validated string values
		string email = body.GetEmail();
		string password = body.GetPassword();

		var user = await userService.GetUserByEmailAsync(email, cancellationToken);

		if (user is null) {
			// No actor exists for an unknown email: the event keeps the
			// attempted email and the classified reason, never a credential.
			await PasswordLogin._LogFailureAsync(
				auditLogService,
				userId: null,
				email,
				SignInFailureReasons.UnknownAccount,
				cancellationToken
			);
			return TypedProblems.BadRequest(
				"Invalid email or password",
				ResponseKeys.InvalidEmailOrPassword
			);
		}

		if (user.IsDeleted) {
			await PasswordLogin._LogFailureAsync(
				auditLogService,
				user.Id,
				email,
				SignInFailureReasons.Deleted,
				cancellationToken
			);
			return TypedProblems.BadRequest(
				"Invalid email or password",
				ResponseKeys.InvalidEmailOrPassword
			);
		}

		if (user.IsSuspended()) {
			await PasswordLogin._LogFailureAsync(
				auditLogService,
				user.Id,
				email,
				SignInFailureReasons.Suspended,
				cancellationToken
			);
			return TypedProblems.BadRequest(
				"User is suspended",
				ResponseKeys.UserSuspended
			);
		}

		if (!user.IsVerified) {
			await PasswordLogin._LogFailureAsync(
				auditLogService,
				user.Id,
				email,
				SignInFailureReasons.NotVerified,
				cancellationToken
			);
			return TypedProblems.BadRequest(
				"User is not verified",
				ResponseKeys.UserNotVerified
			);
		}

		// Verify the password
		if (!PasswordUtils.VerifyPassword(password, user.Password)) {
			await PasswordLogin._LogFailureAsync(
				auditLogService,
				user.Id,
				email,
				SignInFailureReasons.WrongPassword,
				cancellationToken
			);
			return TypedProblems.BadRequest(
				"Invalid email or password",
				ResponseKeys.InvalidEmailOrPassword
			);
		}

		var session = await sessionService.CreateSessionForUser(user, cancellationToken);

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: user.GetRequiredId(),
				Action: AuditActions.LoginSucceeded
			),
			cancellationToken
		);

		return TypedResults.Ok(new PasswordLoginResult {
			UserId = user.GetRequiredId(),
			SessionToken = session.Token,
			SessionExpiresAt = session.ExpiresAt,
			SessionExpiresInMs = (session.ExpiresAt - DateTime.UtcNow).TotalMilliseconds
		});
	}

	private static async Task _LogFailureAsync(
		IAuditLogService auditLogService,
		Guid? userId,
		string email,
		string reason,
		CancellationToken cancellationToken
	) {
		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: userId,
				Action: AuditActions.LoginFailed,
				// The presented email and the classified cause only. The
				// password never reaches this method.
				Details: new {
					Email = email,
					Reason = reason,
				}
			),
			cancellationToken
		);
	}
}
