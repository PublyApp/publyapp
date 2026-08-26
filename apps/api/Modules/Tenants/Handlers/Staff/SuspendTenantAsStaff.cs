using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Tenants.Services;

namespace PublyApp.Api.Modules.Tenants.Handlers.Staff;

public record SuspendTenantAsStaffBody {
	public JsonElement? Reason { get; init; }
}

public record TenantSuspendedResult {
	public required Guid TenantId { get; init; }
	public required string Name { get; init; }
	public required TenantStatus Status { get; init; }
}

public class SuspendTenantAsStaffBodyValidator : AbstractValidator<SuspendTenantAsStaffBody> {
	public SuspendTenantAsStaffBodyValidator() {
		RuleFor(x => x.Reason)
			.MustBeNullableStringWithMaxLength("Reason", 500);
	}
}

public sealed class SuspendTenantAsStaff {
	public static async Task<Results<
		Ok<TenantSuspendedResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppConflictHttpResult
	>> Handle(
		[FromRoute] string tenantId,
		[FromBody] SuspendTenantAsStaffBody request,
		[FromServices] ITenantAsStaffService tenantService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ILogger<SuspendTenantAsStaff> logger,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenantId",
				ResponseKeys.MalformedId
			);
		}

		var reason = request.Reason?.ValueKind == JsonValueKind.String
			? request.Reason.Value.GetString()
			: null;

		var result = await tenantService.SuspendTenantAsync(
			tenantIdGuid,
			cancellationToken
		);

		if (result is SuspendTenantResult.NotFound) {
			return TypedProblems.NotFound(
				"Tenant not found",
				ResponseKeys.TenantNotFound
			);
		}
		if (result is SuspendTenantResult.AlreadySuspended) {
			return TypedProblems.Conflict(
				"Tenant is already suspended",
				ResponseKeys.TenantAlreadySuspended
			);
		}
		if (result is SuspendTenantResult.NotActiveStatus) {
			return TypedProblems.BadRequest(
				"Only active tenants can be suspended",
				ResponseKeys
					.TenantNotActiveCannotSuspend
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

		if (result is not SuspendTenantResult.Success success) {
			throw new InvalidOperationException(
				$"Unknown suspend tenant result: {result.GetType().Name}"
			);
		}
		var tenant = success.Tenant;

		// The suspend already committed above; audit persistence is best-effort
		// from here so it never turns an already-successful mutation into a 500
		// (round-5 API F2 — sweep of every post-commit side effect).
		try {
			await auditLogService.LogAsync(
				new CreateAuditLogArgs(
					UserId: account.UserId,
					Action: AuditActions.TenantSuspended,
					TargetId: tenantIdGuid,
					Details: new { TenantName = tenant.Name, Reason = reason }
				),
				cancellationToken
			);
		} catch (Exception ex) {
			logger.LogWarning(
				ex,
				"Failed to write audit log for tenant suspend {TenantId} by staff user {UserId}",
				tenantIdGuid,
				account.UserId
			);
		}

		return TypedResults.Ok(new TenantSuspendedResult {
			TenantId = tenant.GetRequiredId(),
			Name = tenant.Name,
			Status = tenant.Status
		});
	}
}
