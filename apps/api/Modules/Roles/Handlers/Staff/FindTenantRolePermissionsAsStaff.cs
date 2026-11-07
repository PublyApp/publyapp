using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Roles.Services;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public class FindTenantRolePermissionsAsStaffResult {
	public required List<string> PermissionKeys { get; init; }
}

public sealed class FindTenantRolePermissionsAsStaff {
	public static async Task<Results<
		Ok<FindTenantRolePermissionsAsStaffResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string tenantId,
		[FromRoute] string roleId,
		[FromServices] ITenantRoleQueryAsStaffService tenantRoleService,
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

		var result = await tenantRoleService
			.FindTenantRolePermissionKeysAsync(
				new FindTenantRolePermissionKeysArgs(
					TenantId: tenantIdGuid,
					RoleId: roleIdGuid
				),
				cancellationToken
			);

		if (result is FindTenantRolePermissionKeysResult.RoleNotFound) {
			return TypedProblems.NotFound(
				"Role not found",
				ResponseKeys.NotFound
			);
		}

		if (result is FindTenantRolePermissionKeysResult.Success success) {
			return TypedResults.Ok(new FindTenantRolePermissionsAsStaffResult {
				PermissionKeys = success.PermissionKeys
			});
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
