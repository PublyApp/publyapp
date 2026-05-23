using MainApi.Lib;
using MainApi.Lib.Filters;
using MainApi.Lib.Routes;
using MainApi.Modules.Permissions.Handlers.Staff;

namespace MainApi.Modules.Permissions.Endpoints;

public static class PermissionEndpointsForStaff {
	public static IEndpointRouteBuilder MapPermissionEndpointsForStaff(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(Routes.Permissions.ForStaff.Root)
			.WithTags("Permissions");
		var scopesGroup = group.MapGroup(Routes.Permissions.ForStaff.Scopes.Root);

		scopesGroup.MapGet(
			Routes.Permissions.ForStaff.Scopes.Staff,
			FindStaffPermissions.Handle
		)
			.WithName("FindStaffPermissions")
			.WithSummary("Find staff permissions")
			.WithPermission([
				AppPermissions.Staff.Profiles.GET_FOR_STAFF,
				AppPermissions.Staff.Permissions.LIST_FOR_STAFF
			])
			.WithReqQueryValidation<FindStaffPermissionsQuery>();

		scopesGroup.MapGet(
			Routes.Permissions.ForStaff.Scopes.Tenant,
			FindTenantPermissions.Handle
		)
			.WithName("FindTenantPermissions")
			.WithSummary("Find tenant permissions")
			.WithPermission([
				AppPermissions.Staff.Profiles.GET_FOR_TENANT,
				AppPermissions.Staff.Permissions.LIST_FOR_TENANT
			])
			.WithReqQueryValidation<FindTenantPermissionsQuery>();

		return routes;
	}
}
