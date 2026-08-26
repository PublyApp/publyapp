using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class UpdateStaffUserEmailBody {
	// This endpoint intentionally requires a body, even though the only field is "email".
	// That keeps it symmetric with other write endpoints and allows FluentValidation + 422 responses.
	public JsonElement Email { get; init; }

	public string GetEmail() {
		return Email.GetValueAsString();
	}
}

public sealed class UpdateStaffUserEmailBodyValidator
	: AbstractValidator<UpdateStaffUserEmailBody> {
	public UpdateStaffUserEmailBodyValidator() {
		RuleFor(x => x.Email)
			.MustBeRequiredEmail();
	}
}

public sealed class UpdateStaffUserEmail {
	public static async Task<
		Results<
			Ok<GetStaffUserByIdResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult,
			AppValidationProblemHttpResult
		>
	> Handle(
		[FromRoute] string userId,
		[FromBody] UpdateStaffUserEmailBody body,
		[FromServices] IStaffUserCoreService staffUserCoreService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		CancellationToken cancellationToken
	) {
		// Email changes are high-risk (sign-in identity). We enforce:
		// 1) strict validation via FluentValidation
		// 2) RFC7807 422 for "already in use" so clients can render field errors
		// 3) audit log entry
		if (!Guid.TryParse(userId, out var userIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid user ID",
				ResponseKeys.MalformedId
			);
		}

		var email = body.GetEmail();
		var result = await staffUserCoreService.UpdateStaffUserEmailAsync(
			userIdGuid,
			email,
			cancellationToken
		);

		if (result is UpdateStaffUserEmailResult.NotFound) {
			return TypedProblems.NotFound(
				"User not found",
				ResponseKeys.NotFound
			);
		}

		if (result is UpdateStaffUserEmailResult.EmailAlreadyInUse) {
			return TypedProblems.ValidationProblem(
				"Email is already in use",
				ResponseKeys.EmailAlreadyInUse,
				new Dictionary<string, string[]> {
					{ "email", ["Email is already in use"] }
				}
			);
		}

		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. Ensure the endpoint has .WithPermission()."
			);
		}

		if (result is not UpdateStaffUserEmailResult.Success success) {
			throw new InvalidOperationException(
				$"Unknown update staff user email result: {result.GetType().Name}"
			);
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.StaffUserEmailUpdated,
				TargetId: userIdGuid,
				Details: new {
					TargetUserId = userIdGuid,
					Email = email.Trim().ToLowerInvariant()
				}
			),
			cancellationToken
		);

		var userData = success.UserData;
		return TypedResults.Ok(new GetStaffUserByIdResult {
			Id = userData.User.GetRequiredId(),
			Email = userData.User.Email,
			LastName = userData.User.LastName,
			FirstName = userData.User.FirstName,
			AvatarUrl = userData.User.AvatarUrl,
			AccountLevel = userData.AccountLevel,
			Status = userData.User.Status,
			CreatedAt = userData.User.CreatedAt,
			UpdatedAt = userData.User.UpdatedAt,
		});
	}
}
