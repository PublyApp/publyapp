using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Roles.Services;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class UnassignStaffRolePermission {
	public static async Task<Results<
		NoContent,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string roleId,
		[FromRoute] string permissionKey,
		[FromServices] IStaffRoleAsStaffService roleAsStaffService,
		CancellationToken cancellationToken
	) {
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

		var result = await roleAsStaffService.SetStaffRolePermissionAsync(
			new SetStaffRolePermissionArgs(
				RoleId: roleIdGuid,
				PermissionKey: permissionKey.Trim(),
				IsAssigned: false
			),
			cancellationToken
		);

		if (result is SetStaffRolePermissionResult.RoleNotFound) {
			return TypedProblems.NotFound(
				"Role not found",
				ResponseKeys.NotFound
			);
		}

		// Unassign should be idempotent:
		// if the permission doesn't exist (or isn't staff-scoped), we don't treat it as an error.
		if (result is SetStaffRolePermissionResult.Success
			or SetStaffRolePermissionResult.PermissionNotFound) {
			// No payload: this endpoint is used by switch toggles and can be called frequently.
			return TypedResults.NoContent();
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
