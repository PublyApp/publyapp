using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class ReactivateTenantUserIdentityForStaff {
	public static async Task<Results<
		Ok<TenantUserDetailsForStaffResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppConflictHttpResult
	>> Handle(
		[FromRoute] string userId,
		[FromServices] IUserService userService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(userId, out var userIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid userId",
				ResponseKeys.MalformedId
			);
		}

		// Reactivation clears the global User suspension only. Tenant-level
		// memberships that were separately suspended remain suspended.
		var result = await userService.ReactivateTenantUserIdentityForStaffAsync(
			userIdGuid,
			cancellationToken
		);

		if (result is ReactivateTenantUserIdentityResult.NotFound) {
			return TypedProblems.NotFound(
				"Tenant user not found",
				ResponseKeys.NotFound
			);
		}

		if (result is ReactivateTenantUserIdentityResult.NotSuspended) {
			return TypedProblems.Conflict(
				"Tenant user is not globally suspended",
				ResponseKeys.UserNotSuspended
			);
		}

		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
		}

		if (result is not ReactivateTenantUserIdentityResult.Success success) {
			throw new InvalidOperationException(
				"Unhandled ReactivateTenantUserIdentityResult type: "
				+ $"{result.GetType().Name}"
			);
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.TenantUserIdentityReactivated,
				TargetId: userIdGuid,
				Details: new {
					TenantUserId = userIdGuid,
					ReactivatedByUserId = account.UserId,
				}
			),
			cancellationToken
		);

		return TypedResults.Ok(
			TenantUserDetailsForStaffMapper.Map(success.UserData)
		);
	}
}
