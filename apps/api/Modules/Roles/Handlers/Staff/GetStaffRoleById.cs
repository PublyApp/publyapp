using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Roles.Services;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public class GetStaffRoleByIdResult {
	public required StaffRoleItem Role { get; set; }
}

public sealed class GetStaffRoleById {
	public static async Task<
		Results<
			Ok<GetStaffRoleByIdResult>,
			AppNotFoundHttpResult,
			AppBadRequestHttpResult
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

		var serviceResult =
			await roleQueryAsStaffService.GetStaffRoleByIdAsync(
				roleId: roleIdGuid,
				cancellationToken: cancellationToken
			);

		if (serviceResult is GetStaffRoleByIdServiceResult.RoleNotFound) {
			return TypedProblems.NotFound(
				"Role not found",
				ResponseKeys.NotFound
			);
		}

		if (serviceResult is GetStaffRoleByIdServiceResult.Success success) {
			return TypedResults.Ok(new GetStaffRoleByIdResult { Role = success.Role });
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
