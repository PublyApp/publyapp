using MainApi.Src.Lib;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Profiles.Handlers.Staff;

namespace MainApi.Src.Modules.Profiles.Endpoints;

public static class ProfileEndpointsForStaff {
	public static IEndpointRouteBuilder MapProfileEndpointsForStaff(this IEndpointRouteBuilder routes) {
		var group = routes.MapGroup(PathUtils.GetLastSegment(Routes.Profiles.Base))
			.WithTags("Profiles");

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Profiles.ForStaff.Find),
			FindStaffProfiles.HandleFindStaffProfiles
		)
			.WithName("FindStaffProfiles")
			.WithSummary("Find profiles for a staff member")
			.WithPermission([AppPermissions.Staff.Profiles.LIST_FOR_STAFF])
			.WithReqQueryValidation<FindStaffProfilesQuery>();

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Profiles.ForTenant.Find, n: 2),
			FindTenantProfilesAsStaff.HandleFindTenantProfilesAsStaff
		)
			.WithName("FindTenantProfiles")
			.WithSummary("Find profiles for a tenant")
			.WithPermission([AppPermissions.Staff.Profiles.LIST_FOR_TENANT])
			.WithReqQueryValidation<FindTenantProfilesAsStaffQuery>();

		group.MapPost(
			PathUtils.GetLastSegment(Routes.Profiles.ForStaff.Create),
			CreateStaffProfile.HandleCreateStaffProfile
		)
			.WithName("CreateStaffProfile")
			.WithSummary("Create a new staff profile")
			.WithPermission([AppPermissions.Staff.Profiles.CREATE_FOR_STAFF])
			.WithReqBodyValidation<CreateStaffProfileBody>();

		return routes;
	}
}
