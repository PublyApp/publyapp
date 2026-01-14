using MainApi.Src.Lib;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Permissions.Handlers.Staff;

namespace MainApi.Src.Modules.Permissions.Endpoints;

public static class PermissionEndpointsForStaff {
	public static IEndpointRouteBuilder MapPermissionEndpointsForStaff(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(PathUtils.GetLastSegment(Routes.Permissions.ForStaff.Root))
			.WithTags("Permissions");

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Permissions.ForStaff.Find),
			FindStaffPermissions.HandleFindStaffPermissions
		)
			.WithName("FindStaffPermissions")
			.WithSummary("Find staff permissions")
			.WithPermission([
				AppPermissions.Staff.Profiles.GET_FOR_STAFF,
				AppPermissions.Staff.Permissions.LIST_FOR_STAFF
			])
			.WithReqQueryValidation<FindStaffPermissionsQuery>();

		return routes;
	}
}
