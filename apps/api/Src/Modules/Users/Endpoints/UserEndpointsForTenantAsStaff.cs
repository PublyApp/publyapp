using MainApi.Src.Lib;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Modules.Users.Handlers.Staff;

namespace MainApi.Src.Modules.Users.Endpoints;

public static class UserEndpointsForTenantAsStaff {
	public static IEndpointRouteBuilder MapUserEndpointsForTenantAsStaff(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(Routes.Users.ForTenantAsStaff.Root)
			.WithTags("Tenant Users (Staff View)");

		group.MapGet(
			Routes.Users.ForTenantAsStaff.Find,
			FindTenantUsersAsStaff.HandleFindTenantUsersAsStaff
		)
			.WithName("FindTenantUsersAsStaff")
			.WithSummary("Find users for a tenant")
			.WithPermission([AppPermissions.Staff.Users.LIST_FOR_TENANT])
			.WithReqQueryValidation<FindTenantUsersAsStaffQuery>();

		group.MapPost(
			Routes.Users.ForTenantAsStaff.Invite,
			CreateInvitationForTenantAsStaff.HandleCreateInvitationForTenantAsStaff
		)
			.WithName("CreateInvitationForTenantAsStaff")
			.WithSummary("Invite a user to a tenant")
			.WithPermission([AppPermissions.Staff.Users.CREATE_FOR_TENANT])
			.WithReqBodyValidation<CreateInvitationForTenantAsStaffBody>();

		group.MapDelete(
			Routes.Users.ForTenantAsStaff.Delete,
			RemoveUserFromTenantAsStaff.HandleRemoveUserFromTenantAsStaff
		)
			.WithName("RemoveUserFromTenantAsStaff")
			.WithSummary("Remove a user from a tenant")
			.WithPermission([AppPermissions.Staff.Users.DELETE_FOR_TENANT]);

		group.MapPatch(
			Routes.Users.ForTenantAsStaff.Update,
			UpdateTenantUserAsStaff.HandleUpdateTenantUserAsStaff
		)
			.WithName("UpdateTenantUserAsStaff")
			.WithSummary("Update a tenant user's profile or account level")
			.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_TENANT])
			.WithReqBodyValidation<UpdateTenantUserAsStaffBody>();

		return routes;
	}
}
