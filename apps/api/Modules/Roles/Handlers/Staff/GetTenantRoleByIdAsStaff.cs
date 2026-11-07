using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Roles.Services;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public class GetTenantRoleByIdResponse {
	public required TenantRoleItem Role { get; init; }
}

public sealed class GetTenantRoleByIdAsStaff {
	public static async Task<Results<
		Ok<GetTenantRoleByIdResponse>,
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

		var result = await tenantRoleService.GetTenantRoleByIdAsync(
			new GetTenantRoleByIdArgs(
				TenantId: tenantIdGuid,
				RoleId: roleIdGuid
			),
			cancellationToken
		);

		if (result is GetTenantRoleByIdResult.RoleNotFound) {
			return TypedProblems.NotFound(
				"Role not found",
				ResponseKeys.NotFound
			);
		}

		if (result is GetTenantRoleByIdResult.Success success) {
			return TypedResults.Ok(new GetTenantRoleByIdResponse {
				Role = success.Role
			});
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
