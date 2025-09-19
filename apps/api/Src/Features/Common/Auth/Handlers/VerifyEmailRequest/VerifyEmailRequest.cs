namespace MainApi.Src.Features.Common.Auth.Handlers.VerifyEmailRequest;

using FluentValidation;
using MainApi.Localization;
using MainApi.Src.Features.Common.Email;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Utils;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using System.Text.Json;

public class VerifyEmailRequestBody {
	public required JsonElement Email { get; set; }

	public string GetEmail() {
		return Email.ValueKind switch {
			JsonValueKind.String => Email.GetString() ?? throw new InvalidOperationException("Email cannot be null"),
			_ => throw new InvalidOperationException("Invalid email format")
		};
	}
}

public class VerifyEmailRequestBodyValidator : AbstractValidator<VerifyEmailRequestBody> {
	public VerifyEmailRequestBodyValidator() {
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
	}
}

public class VerifyEmailRequestResult {
	public string Status { get; set; } = "success";
}

public class VerifyEmailRequest {
	public static async Task<
		Results<
			Ok<VerifyEmailRequestResult>,
			BadRequest<ApiResponse>
		>
	> HandleVerifyEmailRequest(
		[FromBody] VerifyEmailRequestBody body,
		[FromServices] IUserService userService,
		[FromServices] IEmailService emailService,
		[FromServices] ILogger<VerifyEmailRequest> logger,
		[FromServices] IOptions<AppSettings> appSettings,
		CancellationToken cancellationToken = default
	) {
		// check if user exists
		var user = await userService.GetUserByEmailAsync(body.GetEmail(), cancellationToken).ConfigureAwait(false);

		if (user == null) {
			return TypedResults.BadRequest(ApiResponse.Create("User not found", ResponseKeys.UserNotFound));
		}

		if (user.IsVerified == true) {
			return TypedResults.BadRequest(ApiResponse.Create("Email already verified", ResponseKeys.EmailAlreadyVerified));
		}

		var userEmail = user.Email;

		// if the token is still valid, reuse it and send email
		if (
			!string.IsNullOrEmpty(user.EmailVerifyToken)
			&& (DateTime.UtcNow < (user.EmailVerifyTokenExpiresAt ?? DateTime.MinValue))
		) {
			// Send email asynchronously with proper error handling
			// We don't await this because we want to return the response immediately
			_ = emailService.SendVerificationMail(userEmail, user.EmailVerifyToken)
				.ContinueWith(t => {
					if (t.Exception != null) {
						logger.LogError(t.Exception, "Error sending verification email to {Email}", userEmail);
					}
				}, cancellationToken);

			return TypedResults.Ok(new VerifyEmailRequestResult());
		}

		var emailVerifyToken = CryptoUtils.RandomString(25);
		var emailVerifyTokenExpiresAt = DateTime.UtcNow.AddDays(appSettings.Value.EMAIL_VERIFY_TOKEN_VALIDITY_DURATION);

		user.IsVerified = false;
		user.EmailVerifyToken = emailVerifyToken;
		user.EmailVerifyTokenExpiresAt = emailVerifyTokenExpiresAt;

		await userService.UpdateUserAsync(user, cancellationToken).ConfigureAwait(false);

		// Send email asynchronously with proper error handling
		// We don't await this because we want to return the response immediately
		_ = emailService.SendVerificationMail(userEmail, user.EmailVerifyToken)
			.ContinueWith(t => {
				if (t.Exception != null) {
					logger.LogError(t.Exception, "Error sending verification email to {Email}", userEmail);
				}
			}, cancellationToken);

		return TypedResults.Ok(new VerifyEmailRequestResult());
	}
}
