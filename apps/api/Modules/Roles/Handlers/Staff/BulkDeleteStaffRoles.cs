using System.ComponentModel.DataAnnotations;
using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Roles.Services;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class BulkDeleteStaffRolesBody {
	// Request payload intentionally holds JsonElement because API contract uses an
	// untyped array for compatibility with current bulk request patterns.
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

public sealed class BulkDeleteStaffRolesBodyValidator
	: AbstractValidator<BulkDeleteStaffRolesBody> {
	public BulkDeleteStaffRolesBodyValidator() {
		this.RuleFor(x => x.RoleIds)
			.MustBeRequiredGuidArray(
				fieldName: "roleIds",
				itemName: "roleId",
				maxCount: 100
			);
	}
}

public sealed class BulkDeleteStaffRoles {
	// Handles one bulk request for multiple staff role IDs and returns a
	// batched success/failure count response, never throwing per-item.
	public static async Task<Ok<BulkRoleActionResult>>
		Handle(
		[FromBody] BulkDeleteStaffRolesBody body,
		[FromServices] IStaffRoleAsStaffService roleAsStaffService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ILogger<BulkDeleteStaffRoles> logger,
		CancellationToken cancellationToken = default
	) {
		// Staff role bulk delete is staff-only and relies on auth context.
		var account = authContext.GetRequiredStaffAccount();

		// Normalize incoming IDs once; backend service enforces max batch size via validation.
		var distinctRoleIds = body.GetRoleIds().Distinct().ToList();
		var result = await roleAsStaffService.BulkDeleteStaffRolesAsync(
			new BulkDeleteStaffRolesArgs(RoleIds: distinctRoleIds),
			cancellationToken
		);

		if (logger.IsEnabled(LogLevel.Information)) {
			logger.LogInformation(
				"Bulk delete staff roles completed: {Succeeded} succeeded, {Failed} failed",
				result.SucceededCount,
				result.FailedCount
			);
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.StaffRoleBulkDeleted,
				TargetId: null,
				Details: new {
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
