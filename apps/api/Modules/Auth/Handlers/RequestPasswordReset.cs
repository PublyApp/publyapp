using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Modules.Auth.Services;

namespace PublyApp.Api.Modules.Auth.Handlers;

public class RequestPasswordResetBody {
	public required JsonElement Email { get; set; }

	public string GetEmail() {
		return Email.GetValueAsString();
	}
}

public class RequestPasswordResetBodyValidator
	: AbstractValidator<RequestPasswordResetBody> {
	public RequestPasswordResetBodyValidator() {
		RuleFor(x => x.Email)
			.MustBeRequiredEmail();
	}
}

public class RequestPasswordResetResult {
	public string Status { get; set; } = "success";
}

// #809 (design §5.4/F6): the reset token is now issued and the email delivered inside
// ONE transaction owned by IPasswordResetService — the reset email is a durable
// `email.password-reset.v1` job, not a fire-and-forget ContinueWith, so a committed
// request always yields a deliverable email. The handler shrinks to validation + a call
// to the service; the response is a constant shape regardless of whether the email
// exists or is verified, so it can never be used to probe account existence (unchanged
// contract).
public sealed class RequestPasswordReset {
	public static async Task<Ok<RequestPasswordResetResult>> Handle(
		[FromBody] RequestPasswordResetBody body,
		[FromServices] IPasswordResetService passwordResetService,
		CancellationToken cancellationToken
	) {
		var email = body.GetEmail();

		await passwordResetService.RequestAsync(email, cancellationToken);

		return TypedResults.Ok(new RequestPasswordResetResult());
	}
}
