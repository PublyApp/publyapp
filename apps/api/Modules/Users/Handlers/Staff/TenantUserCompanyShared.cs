using PublyApp.Api.Lib;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

internal static class TenantUserCompanyShared {
	public static async Task LogBulkActionAsync(
		IAuditLogService auditLogService,
		IRequestAuthContext authContext,
		string action,
		Guid tenantUserId,
		IReadOnlyCollection<Guid> tenantIds,
		TenantUserCompanyBulkActionResult result,
		CancellationToken cancellationToken
	) {
		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
		}

		var requestedTenantIds = tenantIds.Distinct().ToList();
		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: action,
				TargetId: tenantUserId,
				Details: new {
					TenantUserId = tenantUserId,
					RequestedCount = requestedTenantIds.Count,
					SucceededCount = result.SucceededCount,
					FailedCount = result.FailedCount,
					RequestedTenantIds = requestedTenantIds,
					FailedItems = result.FailedItems,
					PerformedByUserId = account.UserId
				}
			),
			cancellationToken
		);
	}
}
