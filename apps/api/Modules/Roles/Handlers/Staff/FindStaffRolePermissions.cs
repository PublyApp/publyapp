using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Roles.Services;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public class FindStaffRolePermissionsResult {
	// We intentionally return the raw permission keys (strings), not a denormalized permission DTO.
	// The UI already loads the catalog of permissions (localized names/descriptions) via /staff/permissions.
	public required List<string> PermissionKeys { get; init; }
}

public sealed class FindStaffRolePermissions {
	public static async Task<
		Results<
			Ok<FindStaffRolePermissionsResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult
		>
	> Handle(
		[FromRoute] string roleId,
		[FromServices] IStaffRoleQueryAsStaffService roleQueryAsStaffService,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(roleId, out var roleIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid roleId",
				ResponseKeys.MalformedId
			);
		}

		var result = await roleQueryAsStaffService.FindStaffRolePermissionKeysAsync(
			roleIdGuid,
			cancellationToken
		);

		if (result is FindStaffRolePermissionKeysResult.RoleNotFound) {
			return TypedProblems.NotFound(
				"Role not found",
				ResponseKeys.NotFound
			);
		}

		if (result is FindStaffRolePermissionKeysResult.Success success) {
			return TypedResults.Ok(new FindStaffRolePermissionsResult {
				PermissionKeys = success.PermissionKeys
			});
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
