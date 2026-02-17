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

		return routes;
	}
}
