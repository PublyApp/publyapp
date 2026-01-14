using MainApi.Src.Lib;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Modules.Profiles.Handlers.Staff;

namespace MainApi.Src.Modules.Profiles.Endpoints;

public static class ProfileEndpointsForStaff {
	public static IEndpointRouteBuilder MapProfileEndpointsForStaff(
		this IEndpointRouteBuilder routes
	) {
		// Staff profile routes: /staff/profiles
		var staffGroup = routes.MapGroup(Routes.Profiles.ForStaff.Root)
			.WithTags("Staff Profiles");

		staffGroup.MapGet(
			Routes.Profiles.ForStaff.Find,
			FindStaffProfiles.HandleFindStaffProfiles
		)
			.WithName("FindStaffProfiles")
			.WithSummary("Find profiles for a staff member")
			.WithPermission([AppPermissions.Staff.Profiles.LIST_FOR_STAFF])
			.WithReqQueryValidation<FindStaffProfilesQuery>();

		staffGroup.MapPost(
			Routes.Profiles.ForStaff.Create,
			CreateStaffProfile.HandleCreateStaffProfile
		)
			.WithName("CreateStaffProfile")
			.WithSummary("Create a new staff profile")
			.WithPermission([AppPermissions.Staff.Profiles.CREATE_FOR_STAFF])
			.WithReqBodyValidation<CreateStaffProfileBody>();

		// Tenant profile routes (viewed by staff): /staff/tenants/{tenantId}/profiles
		var tenantGroup = routes.MapGroup(Routes.Profiles.ForTenantAsStaff.Root)
			.WithTags("Tenant Profiles (Staff View)");

		tenantGroup.MapGet(
			Routes.Profiles.ForTenantAsStaff.Find,
			FindTenantProfilesAsStaff.HandleFindTenantProfilesAsStaff
		)
			.WithName("FindTenantProfiles")
			.WithSummary("Find profiles for a tenant")
			.WithPermission([AppPermissions.Staff.Profiles.LIST_FOR_TENANT])
			.WithReqQueryValidation<FindTenantProfilesAsStaffQuery>();

		return routes;
	}
}
