using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Users.Handlers.Staff;

public sealed class SuspendTenantUserIdentityForStaff {
	public static async Task<Results<
		Ok<TenantUserDetailsForStaffResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppConflictHttpResult
	>> HandleSuspendTenantUserIdentityForStaff(
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

		// This is a global User status change, not a per-tenant membership
		// suspension. The service enforces last-admin protection across tenants.
		var result = await userService.SuspendTenantUserIdentityForStaffAsync(
			userIdGuid,
			cancellationToken
		);

		if (result is SuspendTenantUserIdentityResult.NotFound) {
			return TypedProblems.NotFound(
				"Tenant user not found",
				ResponseKeys.NotFound
			);
		}

		if (result is SuspendTenantUserIdentityResult.AlreadySuspended) {
			return TypedProblems.Conflict(
				"Tenant user is already globally suspended",
				ResponseKeys.UserSuspended
			);
		}

		if (result is SuspendTenantUserIdentityResult.CannotSuspendLastAdmin) {
			return TypedProblems.BadRequest(
				"Cannot suspend the last admin from the tenant",
				ResponseKeys.CannotSuspendLastAdmin
			);
		}

		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
		}

		if (result is not SuspendTenantUserIdentityResult.Success success) {
			throw new InvalidOperationException(
				"Unhandled SuspendTenantUserIdentityResult type: "
				+ $"{result.GetType().Name}"
			);
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.TenantUserIdentitySuspended,
				TargetId: userIdGuid,
				Details: new {
					TenantUserId = userIdGuid,
					SuspendedByUserId = account.UserId,
				}
			),
			cancellationToken
		);

		return TypedResults.Ok(
			TenantUserDetailsForStaffMapper.Map(success.UserData)
		);
	}
}
