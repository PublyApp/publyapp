using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Tenants.Services;

namespace PublyApp.Api.Modules.Tenants.Handlers.Staff;

public sealed class DeleteTenantAsStaff {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string tenantId,
		[FromServices] ITenantAsStaffService tenantService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ILogger<DeleteTenantAsStaff> logger,
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

		// The delete already committed above; audit persistence is best-effort
		// from here so it never turns an already-successful mutation into a 500
		// (round-5 API F2 — sweep of every post-commit side effect).
		try {
			await auditLogService.LogAsync(
				new CreateAuditLogArgs(
					UserId: account.UserId,
					Action: AuditActions.TenantDeleted,
					TargetId: tenantIdGuid,
					Details: new { TenantName = tenant.Name }
				),
				cancellationToken
			);
		} catch (Exception ex) {
			logger.LogWarning(
				ex,
				"Failed to write audit log for tenant delete {TenantId} by staff user {UserId}",
				tenantIdGuid,
				account.UserId
			);
		}

		return TypedResults.Ok(
			ApiResponse.Create(
				"Tenant deleted successfully",
				ResponseKeys.TenantDeletedSuccess
			)
		);
	}
}
