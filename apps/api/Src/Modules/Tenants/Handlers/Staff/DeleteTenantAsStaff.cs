using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Tenants.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Tenants.Handlers.Staff;

public static class DeleteTenantAsStaff {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> HandleDeleteTenantAsStaff(
		[FromRoute] string tenantId,
		[FromServices] ITenantAsStaffService tenantService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenant ID",
				ResponseKeys.MalformedId
			);
		}

		var result = await tenantService.DeleteTenantAsync(
			tenantIdGuid, cancellationToken
		);

		if (result.Error is DeleteTenantError.NotFound) {
			return TypedProblems.NotFound(
				"Tenant not found",
				ResponseKeys.TenantNotFound
			);
		}
		if (result.Error is DeleteTenantError.NotSuspended) {
			return TypedProblems.BadRequest(
				"Only suspended tenants "
				+ "can be deleted",
				ResponseKeys
					.TenantNotSuspendedCannotDelete
			);
		}
		if (result.Error is not null) {
			throw new InvalidOperationException(
				$"Unknown error: {result.Error}"
			);
		}

		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has "
				+ ".WithPermission() middleware."
			);
		}

		if (result.Tenant is null) {
			throw new InvalidOperationException(
				"Service returned success "
				+ "but Tenant was null."
			);
		}
		var tenant = result.Tenant;

		await auditLogService.LogAsync(
			account.UserId,
			AuditActions.TenantDeleted,
			tenantIdGuid,
			new { TenantName = tenant.Name },
			cancellationToken
		);

		return TypedResults.Ok(
			ApiResponse.Create(
				"Tenant deleted successfully",
				ResponseKeys.TenantDeletedSuccess
			)
		);
	}
}
