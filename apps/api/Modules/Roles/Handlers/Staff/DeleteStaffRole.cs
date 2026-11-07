using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Roles.Services;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class DeleteStaffRole {
	public static async Task<
		Results<
			Ok<ApiResponse>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult,
			AppForbiddenHttpResult
		>
	> Handle(
		[FromRoute] string roleId,
		[FromServices] IStaffRoleAsStaffService roleAsStaffService,
		CancellationToken cancellationToken
	) {
		// Keep route-level concerns here only: malformed IDs stay a 400, while
		// existence/soft-delete semantics stay in the service.
		if (!Guid.TryParse(roleId, out var roleIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid roleId",
				ResponseKeys.MalformedId
			);
		}

		var result = await roleAsStaffService.DeleteStaffRoleAsync(
			roleIdGuid,
			cancellationToken
		);

		if (result is DeleteStaffRoleServiceResult.RoleNotFound) {
			return TypedProblems.NotFound(
				"Role not found",
				ResponseKeys.NotFound
			);
		}
		if (result is DeleteStaffRoleServiceResult.SystemRoleProtected) {
			return TypedProblems.Forbidden(
				"The full-access system role cannot be deleted",
				ResponseKeys.Forbidden
			);
		}


		if (result is not DeleteStaffRoleServiceResult.Success success) {
			throw new InvalidOperationException(
				"Unhandled DeleteStaffRoleServiceResult type: " + result.GetType().Name
			);
		}

		return TypedResults.Ok(
			ApiResponse.Create(
				$"Deleted {success.DeletedRoleCount} role(s)",
				ResponseKeys.StaffRoleDeletedSuccess
			)
		);
	}
}
