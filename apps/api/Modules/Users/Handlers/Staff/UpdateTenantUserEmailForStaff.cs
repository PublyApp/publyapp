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

public sealed class UpdateTenantUserEmailForStaffBody {
	public JsonElement Email { get; init; }

	public string GetEmail() {
		return Email.GetValueAsString();
	}
}

public sealed class UpdateTenantUserEmailForStaffBodyValidator
	: AbstractValidator<UpdateTenantUserEmailForStaffBody> {
	public UpdateTenantUserEmailForStaffBodyValidator() {
		RuleFor(x => x.Email)
			.MustBeRequiredEmail();
	}
}

public sealed class UpdateTenantUserEmailForStaff {
	public static async Task<
		Results<
			Ok<TenantUserDetailsForStaffResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult,
			AppValidationProblemHttpResult
		>
	> Handle(
		[FromRoute] string userId,
		[FromBody] UpdateTenantUserEmailForStaffBody body,
		[FromServices] ITenantUserIdentityService tenantUserIdentityService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(userId, out var userIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid userId",
				ResponseKeys.MalformedId
			);
		}

		var email = body.GetEmail();
		// Email is stored on the shared User identity. The route is under
		// tenant-users only because Staff reaches it from that details page.
		var result = await tenantUserIdentityService.UpdateTenantUserEmailForStaffAsync(
			userIdGuid,
			email,
			cancellationToken
		);

		if (result is UpdateTenantUserEmailResult.NotFound) {
			return TypedProblems.NotFound(
				"Tenant user not found",
				ResponseKeys.NotFound
			);
		}

		if (result is UpdateTenantUserEmailResult.EmailAlreadyInUse) {
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
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
		}

		if (result is not UpdateTenantUserEmailResult.Success success) {
			throw new InvalidOperationException(
				"Unhandled UpdateTenantUserEmailResult type: "
				+ $"{result.GetType().Name}"
			);
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.TenantUserEmailUpdated,
				TargetId: userIdGuid,
				Details: new {
					TenantUserId = userIdGuid,
					UpdatedByUserId = account.UserId,
					Email = email.Trim().ToLowerInvariant()
				}
			),
			cancellationToken
		);

		return TypedResults.Ok(
			TenantUserDetailsForStaffMapper.Map(success.UserData)
		);
	}
}
