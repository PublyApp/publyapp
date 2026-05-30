using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.Users.Handlers.Staff;

namespace PublyApp.Api.Modules.Users.Endpoints;

public static class UserEndpointsForTenantAsStaff {
	public static IEndpointRouteBuilder MapUserEndpointsForTenantAsStaff(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(Routes.Users.ForTenantAsStaff.Root)
			.WithTags("Tenant Users (Staff View)");

		group.MapGet(
			Routes.Users.ForTenantAsStaff.Find,
			FindTenantUsersAsStaff.Handle
		)
			.WithName("FindTenantUsersAsStaff")
			.WithSummary("Find users for a tenant")
			.WithPermission([AppPermissions.Staff.Users.LIST_FOR_TENANT])
			.WithReqQueryValidation<FindTenantUsersAsStaffQuery>();

		group.MapGet(
			Routes.Users.ForTenantAsStaff.GetById,
			GetTenantUserAsStaff.Handle
		)
			.WithName("GetTenantUserAsStaff")
			.WithSummary("Get a tenant user")
			.WithPermission([AppPermissions.Staff.Users.GET_FOR_TENANT]);

		group.MapPost(
			Routes.Users.ForTenantAsStaff.Invite,
			CreateInvitationForTenantAsStaff.Handle
		)
			.WithName("CreateInvitationForTenantAsStaff")
			.WithSummary("Invite a user to a tenant")
			.WithPermission([AppPermissions.Staff.Users.CREATE_FOR_TENANT])
			.WithReqBodyValidation<CreateInvitationForTenantAsStaffBody>();

		group.MapDelete(
			Routes.Users.ForTenantAsStaff.Delete,
			RemoveUserFromTenantAsStaff.Handle
		)
			.WithName("RemoveUserFromTenantAsStaff")
			.WithSummary("Remove a user from a tenant")
			.WithPermission([AppPermissions.Staff.Users.DELETE_FOR_TENANT]);

		group.MapPatch(
			Routes.Users.ForTenantAsStaff.Update,
			UpdateTenantUserAsStaff.Handle
		)
			.WithName("UpdateTenantUserAsStaff")
			.WithSummary("Update a tenant user's profile or account level")
			.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_TENANT])
			.WithReqBodyValidation<UpdateTenantUserAsStaffBody>();

		group.MapPost(
			Routes.Users.ForTenantAsStaff.Suspend,
			SuspendTenantUserAsStaff.Handle
		)
			.WithName("SuspendTenantUserAsStaff")
			.WithSummary("Suspend a tenant user")
			.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_TENANT]);

		group.MapPost(
			Routes.Users.ForTenantAsStaff.Reactivate,
			ReactivateTenantUserAsStaff.Handle
		)
			.WithName("ReactivateTenantUserAsStaff")
			.WithSummary("Reactivate a suspended tenant user")
			.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_TENANT]);

		return routes;
	}
}
