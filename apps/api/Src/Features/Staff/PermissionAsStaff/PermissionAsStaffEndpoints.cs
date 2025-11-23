using MainApi.Src.Features.Staff.PermissionAsStaff.Handlers;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Utils;

namespace MainApi.Src.Features.Staff.PermissionAsStaff;

public static class PermissionAsStaffEndpoints {
	public static IEndpointRouteBuilder MapPermissionAsStaffEndpoints(this IEndpointRouteBuilder routes) {
		var group = routes.MapGroup(PathUtils.GetLastSegment(RoutePath.Staff.Permissions.Root))
			.WithTags("Permissions")
			.WithOpenApi();

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
			.WithReqQueryValidation<FindStaffPermissionsQuery>()
			.ProducesApiResponses(StatusCodes.Status500InternalServerError);

		return routes;
	}
}
