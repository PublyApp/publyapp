using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Roles.Services;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class AssignTenantRolePermissionAsStaff {
	public static async Task<Results<
		NoContent,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
			AppForbiddenHttpResult
	>> Handle(
		[FromRoute] string tenantId,
		[FromRoute] string roleId,
		[FromRoute] string permissionKey,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ITenantRoleAsStaffService tenantRoleService,
		[FromServices] IAuditLogService auditLogService,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenant ID",
				ResponseKeys.MalformedId
			);
		}

		if (!Guid.TryParse(roleId, out var roleIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid roleId",
				ResponseKeys.MalformedId
			);
		}

		if (string.IsNullOrWhiteSpace(permissionKey)) {
			return TypedProblems.BadRequest(
				"Invalid permissionKey",
				ResponseKeys.BadRequest
			);
		}

		var normalizedPermissionKey = permissionKey.Trim();
		var result = await tenantRoleService.SetTenantRolePermissionAsync(
			new SetTenantRolePermissionArgs(
				TenantId: tenantIdGuid,
				RoleId: roleIdGuid,
				PermissionKey: normalizedPermissionKey,
				IsAssigned: true
			),
			cancellationToken
		);

		if (result is SetTenantRolePermissionResult.RoleNotFound) {
			return TypedProblems.NotFound(
				"Role not found",
				ResponseKeys.NotFound
			);
		}
		if (result is SetTenantRolePermissionResult.SystemRoleProtected) {
			return TypedProblems.Forbidden(
				"The full-access system role cannot be edited",
				ResponseKeys.Forbidden
			);
		}


		if (result is SetTenantRolePermissionResult.PermissionNotFound) {
			return TypedProblems.BadRequest(
				"Permission not found",
				ResponseKeys.BadRequest
			);
		}

		if (result is SetTenantRolePermissionResult.Success success) {
			if (success.Changed) {
				var account = authContext.GetRequiredStaffAccount();

				await auditLogService.LogAsync(
					new CreateAuditLogArgs(
						UserId: account.UserId,
						Action: AuditActions.TenantRolePermissionsAssigned,
						TargetId: roleIdGuid,
						Details: new {
							TenantId = tenantIdGuid,
							RoleId = roleIdGuid,
							RoleName = success.Role.RoleName,
							IsDefault = success.Role.IsDefault,
							PermissionKey = normalizedPermissionKey
						}
					),
					cancellationToken
				);
			}

			return TypedResults.NoContent();
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
