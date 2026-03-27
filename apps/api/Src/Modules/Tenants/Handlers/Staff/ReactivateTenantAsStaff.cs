using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Tenants.Entities;
using MainApi.Src.Modules.Tenants.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Tenants.Handlers.Staff;

public record TenantReactivatedResult {
	public required Guid TenantId { get; init; }
	public required string Name { get; init; }
	public required bool IsSuspended { get; init; }
	public required string Status { get; init; }
}

public class ReactivateTenantAsStaff {
	public static async Task<Results<
		Ok<TenantReactivatedResult>,
		AppNotFoundHttpResult,
		AppBadRequestHttpResult,
		AppConflictHttpResult
	>> HandleReactivateTenantAsStaff(
		[FromRoute] string tenantId,
		[FromServices] ITenantAsStaffService tenantService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenantId",
				ResponseKeys.MalformedId
			);
		}

		var result = await tenantService.ReactivateTenantAsync(
			tenantIdGuid,
			cancellationToken
		);

		if (result is ReactivateTenantResult.NotFound) {
			return TypedProblems.NotFound(
				"Tenant not found",
				ResponseKeys.TenantNotFound
			);
		}
		if (result is ReactivateTenantResult.NotSuspended) {
			return TypedProblems.Conflict(
				"Tenant is not currently suspended",
				ResponseKeys.TenantNotSuspended
			);
		}

		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in "
				+ "auth context. Ensure the endpoint "
				+ "has .WithPermission() middleware."
			);
		}

		if (result is not ReactivateTenantResult.Success success) {
			throw new InvalidOperationException(
				$"Unknown reactivate tenant result: {result.GetType().Name}"
			);
		}
		var tenant = success.Tenant;

		await auditLogService.LogAsync(
			account.UserId,
			AuditActions.TenantReactivated,
			tenantIdGuid,
			new { TenantName = tenant.Name },
			cancellationToken
		);

		return TypedResults.Ok(new TenantReactivatedResult {
			TenantId = tenant.GetRequiredId(),
			Name = tenant.Name,
			IsSuspended = tenant.IsSuspended,
			Status = Tenant.GetStatusDescription(tenant.Status)
		});
	}
}
