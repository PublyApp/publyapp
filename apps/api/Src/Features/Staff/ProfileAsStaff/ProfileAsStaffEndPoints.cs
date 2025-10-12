using MainApi.Src.Features.Staff.ProfileAsStaff.Handlers;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Utils;

namespace MainApi.Src.Features.Staff.ProfileAsStaff;

public static class ProfileAsStaffEndPoints {
	public static IEndpointRouteBuilder MapProfileAsStaffEndPoints(this IEndpointRouteBuilder routes) {
		var group = routes.MapGroup(PathUtils.GetLastSegment(RoutePath.Staff.Profiles.Root))
			.WithTags("Profiles")
			.WithOpenApi();

		group.MapGet(
			PathUtils.GetLastSegment(RoutePath.Staff.Profiles.FindForTenant, n: 2),
			FindTenantProfilesAsStaff.HandleFindTenantProfilesAsStaff
		)
			.WithName("FindProfiles")
			.WithSummary("Find profiles")
			.WithPermission([PermissionEnum.Staff.CAN_LIST_PROFILES])
			.WithReqQueryValidation<FindTenantProfilesAsStaffQuery>()
			.ProducesApiResponses(StatusCodes.Status500InternalServerError);

		return routes;
	}
}
