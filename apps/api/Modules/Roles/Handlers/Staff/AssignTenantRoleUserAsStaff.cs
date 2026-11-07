using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Roles.Services;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class AssignTenantRoleUserAsStaff {
	public static async Task<Results<
		NoContent,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppValidationProblemHttpResult,
		AppForbiddenHttpResult
	>> Handle(
		[FromRoute] string tenantId,
		[FromRoute] string roleId,
		[FromRoute(Name = "user_account_id")] string userAccountId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ITenantRoleAsStaffService tenantRoleService,
		[FromServices] IRoleAssignmentGuard roleAssignmentGuard,
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

		if (!Guid.TryParse(userAccountId, out var userAccountIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid user_account_id",
				ResponseKeys.MalformedId
			);
		}

		var account = authContext.GetRequiredStaffAccount();

		if (!await roleAssignmentGuard.CanAssignRolesAsync(
			account.UserId,
			[roleIdGuid],
			cancellationToken
		)) {
			return TypedProblems.Forbidden(
				"Only a full-access staff member can assign the full-access role",
				ResponseKeys.Forbidden
			);
		}

		var result = await tenantRoleService.SetTenantRoleUserAsync(
			new SetTenantRoleUserArgs(
				TenantId: tenantIdGuid,
				RoleId: roleIdGuid,
				UserAccountId: userAccountIdGuid,
				IsAssigned: true,
				ActorUserId: account.UserId
			),
			cancellationToken
		);

		if (result is SetTenantRoleUserResult.RoleNotFound) {
			return TypedProblems.NotFound(
				"Role not found",
				ResponseKeys.NotFound
			);
		}

		if (result is SetTenantRoleUserResult.MemberNotFound) {
			return TypedProblems.NotFound(
				"Tenant member not found",
				ResponseKeys.NotFound
			);
		}

		if (result is SetTenantRoleUserResult.MaxRolesPerUserExceeded capExceeded) {
			var errors = new Dictionary<string, string[]> {
				["user_account_id"] = [
					$"Cannot assign more than {capExceeded.MaxRolesPerUser} roles"
				]
			};

			return TypedProblems.ValidationProblem(
				"Max roles per user exceeded",
				ResponseKeys.MaxRolesPerUserExceeded,
				errors
			);
		}

		if (result is not SetTenantRoleUserResult.Success) {
			throw new InvalidOperationException("Unhandled result type");
		}

		// No audit call here: the service records the assignment in the same transaction as the
		// junction row, so the state change and its only history commit together.
		return TypedResults.NoContent();
	}
}
