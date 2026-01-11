using MainApi.Src.Lib;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Staff.PermissionsAsStaff.Handlers;

namespace MainApi.Src.Modules.Staff.PermissionsAsStaff;

public static class PermissionAsStaffEndpoints {
	public static IEndpointRouteBuilder MapPermissionAsStaffEndpoints(this IEndpointRouteBuilder routes) {
		var group = routes.MapGroup(PathUtils.GetLastSegment(RoutePath.Staff.Permissions.Root))
			.WithTags("Permissions");

		group.MapGet(
			PathUtils.GetLastSegment(RoutePath.Staff.Permissions.Find),
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
