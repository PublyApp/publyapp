using MainApi.Src.Lib;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Modules.Users.Handlers.Staff;

namespace MainApi.Src.Modules.Users.Endpoints;

public static class UserEndpointsForTenantUsersAsStaff {
	public static IEndpointRouteBuilder MapUserEndpointsForTenantUsersAsStaff(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(Routes.Users.ForTenantUsersAsStaff.Root)
			.WithTags("Tenant Users (Staff)");

		group.MapGet(
			Routes.Users.ForTenantUsersAsStaff.GetById,
			GetTenantUserByIdForStaff.HandleGetTenantUserByIdForStaff
		)
			.WithName("GetTenantUserByIdForStaff")
			.WithSummary("Get a tenant user with company memberships")
			.WithPermission([AppPermissions.Staff.Users.GET_FOR_TENANT]);

		group.MapPatch(
			Routes.Users.ForTenantUsersAsStaff.Update,
			UpdateTenantUserIdentityForStaff
				.HandleUpdateTenantUserIdentityForStaff
		)
			.WithName("UpdateTenantUserIdentityForStaff")
			.WithSummary("Update a tenant user's shared identity fields")
			.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_TENANT])
			.WithReqBodyValidation<UpdateTenantUserIdentityForStaffBody>();

		return routes;
	}
}
