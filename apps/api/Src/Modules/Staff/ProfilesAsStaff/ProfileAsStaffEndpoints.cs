using MainApi.Src.Lib;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Staff.ProfilesAsStaff.Handlers;

namespace MainApi.Src.Modules.Staff.ProfilesAsStaff;

public static class ProfileAsStaffEndpoints {
	public static IEndpointRouteBuilder MapProfileAsStaffEndpoints(this IEndpointRouteBuilder routes) {
		var group = routes.MapGroup(PathUtils.GetLastSegment(RoutePath.Staff.Profiles.Root))
			.WithTags("Profiles");

		group.MapGet(
			PathUtils.GetLastSegment(RoutePath.Staff.Profiles.FindForStaff),
			FindStaffProfiles.HandleFindStaffProfiles
		)
			.WithName("FindStaffProfiles")
			.WithSummary("Find profiles for a staff member")
			.WithPermission([AppPermissions.Staff.Profiles.LIST_FOR_STAFF])
			.WithReqQueryValidation<FindStaffProfilesQuery>()
			;

		group.MapGet(
			PathUtils.GetLastSegment(RoutePath.Staff.Profiles.FindForTenant, n: 2),
			FindTenantProfilesAsStaff.HandleFindTenantProfilesAsStaff
		)
			.WithName("FindTenantProfiles")
			.WithSummary("Find profiles for a tenant")
			.WithPermission([AppPermissions.Staff.Profiles.LIST_FOR_TENANT])
			.WithReqQueryValidation<FindTenantProfilesAsStaffQuery>()
			;

		group.MapPost(
			PathUtils.GetLastSegment(RoutePath.Staff.Profiles.CreateForStaff),
			CreateStaffProfile.HandleCreateStaffProfile
		)
			.WithName("CreateStaffProfile")
			.WithSummary("Create a new staff profile")
			.WithPermission([AppPermissions.Staff.Profiles.CREATE_FOR_STAFF])
			.WithReqBodyValidation<CreateStaffProfileBody>()
			;

		return routes;
	}
}
