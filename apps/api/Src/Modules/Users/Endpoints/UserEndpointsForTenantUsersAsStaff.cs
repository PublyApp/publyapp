using MainApi.Src.Lib;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Modules.Users.Handlers.Staff;

namespace MainApi.Src.Modules.Users.Endpoints;

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
			GetTenantUserByIdForStaff.HandleGetTenantUserByIdForStaff
		)
			.WithName("GetTenantUserByIdForStaff")
			.WithSummary("Get a tenant user's shared identity details")
			.WithPermission([AppPermissions.Staff.Users.GET_FOR_TENANT]);

		group.MapGet(
			Routes.Users.ForTenantUsersAsStaff.FindCompanies,
			FindTenantUserCompaniesForStaff
				.HandleFindTenantUserCompaniesForStaff
		)
			.WithName("FindTenantUserCompaniesForStaff")
			.WithSummary("Find companies assigned to a tenant user")
			.WithPermission([AppPermissions.Staff.Users.GET_FOR_TENANT])
			.WithReqQueryValidation<FindTenantUserCompaniesForStaffQuery>();

		group.MapPost(
			Routes.Users.ForTenantUsersAsStaff.AssignCompanies,
			AssignTenantUserCompaniesForStaff
				.HandleAssignTenantUserCompaniesForStaff
		)
			.WithName("AssignTenantUserCompaniesForStaff")
			.WithSummary("Assign companies to a tenant user")
			.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_TENANT])
			.WithReqBodyValidation<AssignTenantUserCompaniesForStaffBody>();

		group.MapPost(
			Routes.Users.ForTenantUsersAsStaff.BulkRemoveCompanies,
			BulkRemoveTenantUserCompaniesForStaff
				.HandleBulkRemoveTenantUserCompaniesForStaff
		)
			.WithName("BulkRemoveTenantUserCompaniesForStaff")
			.WithSummary("Remove a tenant user from selected companies")
			.WithPermission([AppPermissions.Staff.Users.DELETE_FOR_TENANT])
			.WithReqBodyValidation<TenantUserCompanyIdsForStaffBody>();

		group.MapPost(
			Routes.Users.ForTenantUsersAsStaff.BulkSuspendCompanies,
			BulkSuspendTenantUserCompaniesForStaff
				.HandleBulkSuspendTenantUserCompaniesForStaff
		)
			.WithName("BulkSuspendTenantUserCompaniesForStaff")
			.WithSummary("Suspend a tenant user in selected companies")
			.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_TENANT])
			.WithReqBodyValidation<TenantUserCompanyIdsForStaffBody>();

		group.MapPost(
			Routes.Users.ForTenantUsersAsStaff.BulkReactivateCompanies,
			BulkReactivateTenantUserCompaniesForStaff
				.HandleBulkReactivateTenantUserCompaniesForStaff
		)
			.WithName("BulkReactivateTenantUserCompaniesForStaff")
			.WithSummary("Reactivate a tenant user in selected companies")
			.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_TENANT])
			.WithReqBodyValidation<TenantUserCompanyIdsForStaffBody>();

		group.MapPatch(
			Routes.Users.ForTenantUsersAsStaff.Update,
			UpdateTenantUserIdentityForStaff
				.HandleUpdateTenantUserIdentityForStaff
		)
			.WithName("UpdateTenantUserIdentityForStaff")
			.WithSummary("Update a tenant user's shared identity fields")
			.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_TENANT])
			.WithReqBodyValidation<UpdateTenantUserIdentityForStaffBody>();

		group.MapPatch(
			Routes.Users.ForTenantUsersAsStaff.UpdateEmail,
			UpdateTenantUserEmailForStaff
				.HandleUpdateTenantUserEmailForStaff
		)
			.WithName("UpdateTenantUserEmailForStaff")
			.WithSummary("Update a tenant user's shared identity email")
			.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_TENANT])
			.WithReqBodyValidation<UpdateTenantUserEmailForStaffBody>();

		group.MapPost(
			Routes.Users.ForTenantUsersAsStaff.Suspend,
			SuspendTenantUserIdentityForStaff
				.HandleSuspendTenantUserIdentityForStaff
		)
			.WithName("SuspendTenantUserIdentityForStaff")
			.WithSummary("Globally suspend a tenant user identity")
			.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_TENANT]);

		group.MapPost(
			Routes.Users.ForTenantUsersAsStaff.Reactivate,
			ReactivateTenantUserIdentityForStaff
				.HandleReactivateTenantUserIdentityForStaff
		)
			.WithName("ReactivateTenantUserIdentityForStaff")
			.WithSummary("Globally reactivate a tenant user identity")
			.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_TENANT]);

		return routes;
	}
}
