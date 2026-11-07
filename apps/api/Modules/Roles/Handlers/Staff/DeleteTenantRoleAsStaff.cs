using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Roles.Services;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class DeleteTenantRoleAsStaff {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
			AppForbiddenHttpResult
	>> Handle(
		[FromRoute] string tenantId,
		[FromRoute] string roleId,
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

		var result = await tenantRoleService.DeleteTenantRoleAsync(
			new DeleteTenantRoleArgs(
				TenantId: tenantIdGuid,
				RoleId: roleIdGuid
			),
			cancellationToken
		);

		if (result is DeleteTenantRoleResult.RoleNotFound) {
			return TypedProblems.NotFound(
				"Role not found",
				ResponseKeys.NotFound
			);
		}
		if (result is DeleteTenantRoleResult.SystemRoleProtected) {
			return TypedProblems.Forbidden(
				"The full-access system role cannot be deleted",
				ResponseKeys.Forbidden
			);
		}


		if (result is DeleteTenantRoleResult.DefaultRoleDeletionNotAllowed) {
			return TypedProblems.BadRequest(
				"Default tenant role cannot be deleted",
				ResponseKeys.TenantRoleDefaultDeleteNotAllowed
			);
		}

		if (result is not DeleteTenantRoleResult.Success success) {
			throw new InvalidOperationException(
				"Unhandled DeleteTenantRoleResult type: "
				+ result.GetType().Name
			);
		}

		var account = authContext.GetRequiredStaffAccount();

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.TenantRoleDeleted,
				TargetId: roleIdGuid,
				Details: new {
					// Log the pre-delete snapshot because the role row is soft-deleted and its
					// junction rows are removed in the same transaction.
					TenantId = tenantIdGuid,
					RoleId = roleIdGuid,
					RoleName = success.Role.RoleName,
					IsDefault = success.Role.IsDefault
				}
			),
			cancellationToken
		);

		return TypedResults.Ok(
			ApiResponse.Create(
				"Tenant role deleted successfully",
				ResponseKeys.TenantRoleDeletedSuccess
			)
		);
	}
}
