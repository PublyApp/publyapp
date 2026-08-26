using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Tenants.Services;

namespace PublyApp.Api.Modules.Tenants.Handlers.Staff;

public record TenantReactivatedResult {
	public required Guid TenantId { get; init; }
	public required string Name { get; init; }
	public required TenantStatus Status { get; init; }
}

public sealed class ReactivateTenantAsStaff {
	public static async Task<Results<
		Ok<TenantReactivatedResult>,
		AppNotFoundHttpResult,
		AppBadRequestHttpResult,
		AppConflictHttpResult
	>> Handle(
		[FromRoute] string tenantId,
		[FromServices] ITenantAsStaffService tenantService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ILogger<ReactivateTenantAsStaff> logger,
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

		// The reactivate already committed above; audit persistence is best-effort
		// from here so it never turns an already-successful mutation into a 500
		// (round-5 API F2 — sweep of every post-commit side effect).
		try {
			await auditLogService.LogAsync(
				new CreateAuditLogArgs(
					UserId: account.UserId,
					Action: AuditActions.TenantReactivated,
					TargetId: tenantIdGuid,
					Details: new { TenantName = tenant.Name }
				),
				cancellationToken
			);
		} catch (Exception ex) {
			logger.LogWarning(
				ex,
				"Failed to write audit log for tenant reactivate {TenantId} by staff user {UserId}",
				tenantIdGuid,
				account.UserId
			);
		}

		return TypedResults.Ok(new TenantReactivatedResult {
			TenantId = tenant.GetRequiredId(),
			Name = tenant.Name,
			Status = tenant.Status
		});
	}
}
