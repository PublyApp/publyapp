using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Roles.Services;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class UnassignTenantRoleUserAsStaff {
	public static async Task<Results<
		NoContent,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string tenantId,
		[FromRoute] string roleId,
		[FromRoute(Name = "user_account_id")] string userAccountId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ITenantRoleAsStaffService tenantRoleService,
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

		var result = await tenantRoleService.SetTenantRoleUserAsync(
			new SetTenantRoleUserArgs(
				TenantId: tenantIdGuid,
				RoleId: roleIdGuid,
				UserAccountId: userAccountIdGuid,
				IsAssigned: false,
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

		if (result is SetTenantRoleUserResult.LastFullAccessRoleAssignment) {
			return TypedProblems.BadRequest(
				"Cannot remove the last full-access owner from the tenant",
				ResponseKeys.CannotRemoveLastAdmin
			);
		}

		if (result is not SetTenantRoleUserResult.Success) {
			throw new InvalidOperationException("Unhandled result type");
		}

		// No audit call here: the service records the unassignment in the same transaction as
		// the junction delete. That matters most on this path — the row is hard-deleted, so the
		// audit entry is the only surviving evidence the membership ever existed.
		return TypedResults.NoContent();
	}
}
