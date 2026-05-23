using MainApi.Lib;
using MainApi.Lib.Filters;
using MainApi.Lib.Routes;
using MainApi.Modules.Users.Handlers.Staff;

namespace MainApi.Modules.Users.Endpoints;

public static class UserEndpointsForTenantUsersAsStaff {
	public static IEndpointRouteBuilder MapUserEndpointsForTenantUsersAsStaff(
		this IEndpointRouteBuilder routes
	) {
		// These first-class routes are keyed by User.Id, not UserAccount.Id.
		// Company actions below mutate tenant memberships while keeping the
		// identity details URL stable.
		var group = routes.MapGroup(Routes.Users.ForTenantUsersAsStaff.Root)
			.WithTags("Tenant Users (Staff)");

		group.MapGet(
			Routes.Users.ForTenantUsersAsStaff.GetById,
			GetTenantUserByIdForStaff.Handle
		)
			.WithName("GetTenantUserByIdForStaff")
			.WithSummary("Get a tenant user's shared identity details")
			.WithPermission([AppPermissions.Staff.Users.GET_FOR_TENANT]);

		group.MapGet(
			Routes.Users.ForTenantUsersAsStaff.FindCompanies,
			FindTenantUserCompaniesForStaff
				.Handle
		)
			.WithName("FindTenantUserCompaniesForStaff")
			.WithSummary("Find companies assigned to a tenant user")
			.WithPermission([AppPermissions.Staff.Users.GET_FOR_TENANT])
			.WithReqQueryValidation<FindTenantUserCompaniesForStaffQuery>();

		group.MapPost(
			Routes.Users.ForTenantUsersAsStaff.AssignCompanies,
			AssignTenantUserCompaniesForStaff
				.Handle
		)
			.WithName("AssignTenantUserCompaniesForStaff")
			.WithSummary("Assign companies to a tenant user")
			.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_TENANT])
			.WithReqBodyValidation<AssignTenantUserCompaniesForStaffBody>();

		group.MapPost(
			Routes.Users.ForTenantUsersAsStaff.BulkRemoveCompanies,
			BulkRemoveTenantUserCompaniesForStaff
				.Handle
		)
			.WithName("BulkRemoveTenantUserCompaniesForStaff")
			.WithSummary("Remove a tenant user from selected companies")
			.WithPermission([AppPermissions.Staff.Users.DELETE_FOR_TENANT])
			.WithReqBodyValidation<TenantUserCompanyIdsForStaffBody>();

		group.MapPost(
			Routes.Users.ForTenantUsersAsStaff.BulkSuspendCompanies,
			BulkSuspendTenantUserCompaniesForStaff
				.Handle
		)
			.WithName("BulkSuspendTenantUserCompaniesForStaff")
			.WithSummary("Suspend a tenant user in selected companies")
			.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_TENANT])
			.WithReqBodyValidation<TenantUserCompanyIdsForStaffBody>();

		group.MapPost(
			Routes.Users.ForTenantUsersAsStaff.BulkReactivateCompanies,
			BulkReactivateTenantUserCompaniesForStaff
				.Handle
		)
			.WithName("BulkReactivateTenantUserCompaniesForStaff")
			.WithSummary("Reactivate a tenant user in selected companies")
			.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_TENANT])
			.WithReqBodyValidation<TenantUserCompanyIdsForStaffBody>();

		group.MapPatch(
			Routes.Users.ForTenantUsersAsStaff.Update,
			UpdateTenantUserIdentityForStaff
				.Handle
		)
			.WithName("UpdateTenantUserIdentityForStaff")
			.WithSummary("Update a tenant user's shared identity fields")
			.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_TENANT])
			.WithReqBodyValidation<UpdateTenantUserIdentityForStaffBody>();

		group.MapPatch(
			Routes.Users.ForTenantUsersAsStaff.UpdateEmail,
			UpdateTenantUserEmailForStaff
				.Handle
		)
			.WithName("UpdateTenantUserEmailForStaff")
			.WithSummary("Update a tenant user's shared identity email")
			.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_TENANT])
			.WithReqBodyValidation<UpdateTenantUserEmailForStaffBody>();

		group.MapPost(
			Routes.Users.ForTenantUsersAsStaff.Suspend,
			SuspendTenantUserIdentityForStaff
				.Handle
		)
			.WithName("SuspendTenantUserIdentityForStaff")
			.WithSummary("Globally suspend a tenant user identity")
			.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_TENANT]);

		group.MapPost(
			Routes.Users.ForTenantUsersAsStaff.Reactivate,
			ReactivateTenantUserIdentityForStaff
				.Handle
		)
			.WithName("ReactivateTenantUserIdentityForStaff")
			.WithSummary("Globally reactivate a tenant user identity")
			.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_TENANT]);

		return routes;
	}
}
