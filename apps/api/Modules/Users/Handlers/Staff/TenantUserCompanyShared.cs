using PublyApp.Api.Lib;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

/// <summary>
/// Shared audit-log and guard helpers for all four bulk-action handlers in this
/// action family; internal because it is scoped here, not a domain service.
/// Extracted in #538 C when the original single-file action family split into four files.
/// </summary>
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

		// Audit logs deduplicate requested tenant IDs to align counts with bulk-result accounting.
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
