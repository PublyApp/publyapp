using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

/// <summary>
/// Reactivates one or more suspended company memberships for a tenant user as a staff admin.
/// </summary>
public sealed class BulkReactivateTenantUserCompaniesForStaff {
	public static async Task<Results<
		Ok<TenantUserCompanyBulkActionResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string userId,
		[FromBody] TenantUserCompanyIdsForStaffBody body,
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

		var tenantUser = await userService.GetTenantUserDetailsForStaffAsync(
			userIdGuid,
			cancellationToken
		);
		if (tenantUser is null) {
			return TypedProblems.NotFound(
				"Tenant user not found",
				ResponseKeys.NotFound
			);
		}

		var tenantIds = body.GetTenantIds();
		var result = await userService.BulkReactivateTenantUserCompaniesForStaffAsync(
			new TenantUserCompanyIdsArgs(
				UserId: userIdGuid,
				TenantIds: tenantIds
			),
			cancellationToken
		);

		await TenantUserCompanyShared.LogBulkActionAsync(
			auditLogService,
			authContext,
			AuditActions.TenantUserCompaniesBulkReactivated,
			userIdGuid,
			tenantIds,
			result,
			cancellationToken
		);

		return TypedResults.Ok(result);
	}
}
