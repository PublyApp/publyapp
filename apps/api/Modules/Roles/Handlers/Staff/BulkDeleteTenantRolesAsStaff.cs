using System.ComponentModel.DataAnnotations;
using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Roles.Services;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class BulkDeleteTenantRolesBody {
	// Request payload intentionally holds JsonElement so the shared validator can
	// enforce JSON shape and max-count constraints uniformly.
	[Required]
	public JsonElement RoleIds { get; init; }

	public List<Guid> GetRoleIds() {
		var roleIds = new List<Guid>();
		foreach (var roleIdElement in this.RoleIds.EnumerateArray()) {
			roleIds.Add(roleIdElement.GetValueAsGuid());
		}
		return roleIds;
	}
}

public sealed class BulkDeleteTenantRolesBodyValidator
	: AbstractValidator<BulkDeleteTenantRolesBody> {
	public BulkDeleteTenantRolesBodyValidator() {
		this.RuleFor(x => x.RoleIds)
			.MustBeRequiredGuidArray(
				fieldName: "roleIds",
				itemName: "roleId",
				maxCount: 100
			);
	}
}

public sealed class BulkDeleteTenantRolesAsStaff {
	// Handles tenant-scoped bulk deletes. Returns aggregated batch status and keeps
	// per-role failures visible to the caller.
	public static async Task<
		Results<Ok<BulkRoleActionResult>, AppBadRequestHttpResult>
	> Handle(
		[FromRoute] string tenantId,
		[FromBody] BulkDeleteTenantRolesBody body,
		[FromServices] ITenantRoleAsStaffService tenantRoleService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ILogger<BulkDeleteTenantRolesAsStaff> logger,
		CancellationToken cancellationToken = default
	) {
		// Tenant-scoped bulk delete requires staff context and a valid tenant route id.
		var account = authContext.GetRequiredStaffAccount();

		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenant ID",
				ResponseKeys.MalformedId
			);
		}

		var distinctRoleIds = body.GetRoleIds().Distinct().ToList();
		var result = await tenantRoleService.BulkDeleteTenantRolesAsync(
			new BulkDeleteTenantRolesArgs(
				TenantId: tenantIdGuid,
				RoleIds: distinctRoleIds
			),
			cancellationToken
		);

		if (logger.IsEnabled(LogLevel.Information)) {
			logger.LogInformation(
				"Bulk delete tenant roles completed: {Succeeded} succeeded, {Failed} failed",
				result.SucceededCount,
				result.FailedCount
			);
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.TenantRoleBulkDeleted,
				TargetId: null,
				Details: new {
					TenantId = tenantIdGuid,
					RequestedCount = distinctRoleIds.Count,
					result.SucceededCount,
					result.FailedCount,
					RoleIds = distinctRoleIds,
					FailedItems = result.FailedItems
				}
			),
			cancellationToken
		);

		return TypedResults.Ok(result);
	}
}
