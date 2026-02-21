using System.Text.Json;

using FluentValidation;

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

public record SuspendTenantAsStaffBody {
	public JsonElement? Reason { get; init; }
}

public record TenantSuspendedResult {
	public required Guid TenantId { get; init; }
	public required string Name { get; init; }
	public required bool IsSuspended { get; init; }
	public required string Status { get; init; }
}

public class SuspendTenantAsStaffBodyValidator : AbstractValidator<SuspendTenantAsStaffBody> {
	public SuspendTenantAsStaffBodyValidator() {
		RuleFor(x => x.Reason)
			.Must(x => x is null ||
				x.Value.ValueKind == JsonValueKind.Null ||
				x.Value.ValueKind == JsonValueKind.Undefined ||
				x.Value.ValueKind == JsonValueKind.String)
			.WithMessage("Reason must be a string")
			.DependentRules(() => {
				RuleFor(x => x.Reason)
					.Must(x => {
						if (x is null ||
							x.Value.ValueKind == JsonValueKind.Null ||
							x.Value.ValueKind == JsonValueKind.Undefined) {
							return true;
						}
						var reasonString = x.Value.GetString();
						return reasonString is null || reasonString.Length <= 500;
					})
					.WithMessage("Reason must be 500 characters or less");
			});
	}
}

public static class SuspendTenantAsStaff {
	public static async Task<Results<
		Ok<TenantSuspendedResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppConflictHttpResult
	>> HandleSuspendTenantAsStaff(
		[FromRoute] Guid tenantId,
		[FromServices] ITenantAsStaffService tenantService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		[FromBody] SuspendTenantAsStaffBody request,
		CancellationToken cancellationToken = default
	) {
		var reason = request.Reason?.ValueKind == JsonValueKind.String
			? request.Reason.Value.GetString()
			: null;

		var result = await tenantService.SuspendTenantAsync(tenantId, cancellationToken);

		if (result.Error
			is SuspendTenantError.NotFound
		) {
			return TypedProblems.NotFound(
				"Tenant not found",
				ResponseKeys.TenantNotFound
			);
		}
		if (result.Error
			is SuspendTenantError.AlreadySuspended
		) {
			return TypedProblems.Conflict(
				"Tenant is already suspended",
				ResponseKeys.TenantAlreadySuspended
			);
		}
		if (result.Error
			is SuspendTenantError.NotActiveStatus
		) {
			return TypedProblems.BadRequest(
				"Only active tenants can be suspended",
				ResponseKeys
					.TenantNotActiveCannotSuspend
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
				"Staff account not found in "
				+ "auth context. Ensure the endpoint "
				+ "has .WithPermission() middleware."
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
			AuditActions.TenantSuspended,
			tenantId,
			new { TenantName = tenant.Name, Reason = reason },
			cancellationToken
		);

		return TypedResults.Ok(new TenantSuspendedResult {
			TenantId = tenant.GetRequiredId(),
			Name = tenant.Name,
			IsSuspended = tenant.IsSuspended,
			Status = Tenant.GetStatusDescription(tenant.Status)
		});
	}
}
