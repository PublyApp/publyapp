using System.Text.Json;

using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Infrastructure.Messaging.Email;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Lib.Validation;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Auth.Handlers;

public class VerifyEmailRequestBody {
	public required JsonElement Email { get; set; }

	public string GetEmail() {
		return Email.GetValueAsString();
	}
}

public class VerifyEmailRequestBodyValidator
	: AbstractValidator<VerifyEmailRequestBody> {
	public VerifyEmailRequestBodyValidator() {
		RuleFor(x => x.Email)
			.MustBeRequiredEmail();
	}
}

public class VerifyEmailRequestResult {
	public string Status { get; set; } = "success";
}

public class VerifyEmailRequest {
	public static async Task<
		Results<
			Ok<VerifyEmailRequestResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult
		>
	> HandleVerifyEmailRequest(
		[FromBody] VerifyEmailRequestBody body,
		[FromServices] IUserService userService,
		[FromServices] IEmailService emailService,
		[FromServices] ILogger<VerifyEmailRequest> logger,
		CancellationToken cancellationToken
	) {
		var env = AppEnvironment.Instance;

		// check if user exists
		var user = await userService.GetUserByEmailAsync(
			body.GetEmail(), cancellationToken
		);

		if (user is null) {
			return TypedProblems.NotFound(
				"User not found",
				ResponseKeys.NotFound
			);
		}

		if (user.IsVerified == true) {
			return TypedProblems.BadRequest("Email already verified", ResponseKeys.EmailAlreadyVerified);
		}

		var userEmail = user.Email;

		// if the token is still valid, reuse it and send email
		if (
			!string.IsNullOrEmpty(user.EmailVerifyToken)
			&& (DateTime.UtcNow < (user.EmailVerifyTokenExpiresAt ?? DateTime.MinValue))
		) {
			// Send email asynchronously with proper error handling
			// We don't await this because we want to return the response immediately
			_ = emailService.SendEmailVerificationRequestAsync(userEmail, user.EmailVerifyToken)
				.ContinueWith(t => {
					if (t.Exception != null) {
						if (logger.IsEnabled(LogLevel.Error)) {
							logger.LogError(t.Exception, "Error sending verification email to {Email}", userEmail);
						}
					}
				}, cancellationToken);

			return TypedResults.Ok(new VerifyEmailRequestResult());
		}

		var emailVerifyToken = CryptoUtils.RandomString(env.EMAIL_VERIFY_TOKEN_LENGTH);
		var emailVerifyTokenExpiresAt = DateTime.UtcNow.AddDays(env.EMAIL_VERIFY_TOKEN_VALIDITY_DURATION);

		user.IsVerified = false;
		user.EmailVerifyToken = emailVerifyToken;
		user.EmailVerifyTokenExpiresAt = emailVerifyTokenExpiresAt;

		await userService.UpdateUserAsync(user, cancellationToken);

		// Send email asynchronously with proper error handling
		// We don't await this because we want to return the response immediately
		_ = emailService.SendEmailVerificationRequestAsync(userEmail, user.EmailVerifyToken)
			.ContinueWith(t => {
				if (t.Exception != null) {
					if (logger.IsEnabled(LogLevel.Error)) {
						logger.LogError(t.Exception, "Error sending verification email to {Email}", userEmail);
					}
				}
			}, cancellationToken);

		return TypedResults.Ok(new VerifyEmailRequestResult());
	}
}
