using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Auth.Services;

namespace PublyApp.Api.Modules.Auth.Handlers;

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

public sealed class VerifyEmailRequest {
	public static async Task<
		Results<
			Ok<VerifyEmailRequestResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult
		>
	> Handle(
		[FromBody] VerifyEmailRequestBody body,
		[FromServices] IVerifyEmailRequestService verifyEmailRequestService,
		CancellationToken cancellationToken
	) {
		var result = await verifyEmailRequestService.RequestAsync(
			body.GetEmail(),
			cancellationToken
		);

		if (result is VerifyEmailRequestServiceResult.NotFound) {
			return TypedProblems.NotFound(
				"User not found",
				ResponseKeys.NotFound
			);
		}

		if (result is VerifyEmailRequestServiceResult.EmailAlreadyVerified) {
			return TypedProblems.BadRequest(
				"Email already verified",
				ResponseKeys.EmailAlreadyVerified
			);
		}

		if (result is VerifyEmailRequestServiceResult.Success) {
			return TypedResults.Ok(new VerifyEmailRequestResult());
		}

		return TypedProblems.BadRequest(
			"Failed to request email verification",
			ResponseKeys.BadRequest
		);
	}
}
