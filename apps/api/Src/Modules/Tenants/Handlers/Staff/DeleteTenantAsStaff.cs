using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Tenants.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Tenants.Handlers.Staff;

public class DeleteTenantAsStaff {
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

		if (result is DeleteTenantResult.NotFound) {
			return TypedProblems.NotFound(
				"Tenant not found",
				ResponseKeys.TenantNotFound
			);
		}
		if (result is DeleteTenantResult.NotSuspended) {
			return TypedProblems.BadRequest(
				"Only suspended tenants "
				+ "can be deleted",
				ResponseKeys
					.TenantNotSuspendedCannotDelete
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

		if (result is not DeleteTenantResult.Success success) {
			throw new InvalidOperationException(
				$"Unknown delete tenant result: {result.GetType().Name}"
			);
		}
		var tenant = success.Tenant;

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
