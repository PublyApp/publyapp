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

		staffGroup.MapGet(
			Routes.Profiles.ForStaff.Get,
			GetStaffProfileById.HandleGetStaffProfileById
		)
			.WithName("GetStaffProfileById")
			.WithSummary("Get a staff profile by id")
			.WithPermission([AppPermissions.Staff.Profiles.GET_FOR_STAFF]);

		staffGroup.MapPatch(
			Routes.Profiles.ForStaff.Update,
			UpdateStaffProfile.HandleUpdateStaffProfile
		)
			.WithName("UpdateStaffProfile")
			.WithSummary("Update a staff profile (name/description)")
			// Reuse the same update permission for both profile detail edits and permission assignment:
			// if you can change what a profile *means*, you can change its attached permissions.
			.WithPermission([AppPermissions.Staff.Profiles.UPDATE_FOR_STAFF])
			.WithReqBodyValidation<UpdateStaffProfileBody>();

		staffGroup.MapGet(
			Routes.Profiles.ForStaff.Permissions.Find,
			FindStaffProfilePermissions.HandleFindStaffProfilePermissions
		)
			.WithName("FindStaffProfilePermissions")
			.WithSummary("List permission keys assigned to a staff profile")
			// Treat "read permissions for profile" as part of profile read access.
			.WithPermission([AppPermissions.Staff.Profiles.GET_FOR_STAFF]);

		staffGroup.MapPost(
			Routes.Profiles.ForStaff.Permissions.Upsert,
			AssignStaffProfilePermission.HandleAssignStaffProfilePermission
		)
			.WithName("AssignStaffProfilePermission")
			.WithSummary("Assign a permission key to a staff profile")
			.WithPermission([AppPermissions.Staff.Profiles.UPDATE_FOR_STAFF]);

		staffGroup.MapDelete(
			Routes.Profiles.ForStaff.Permissions.Upsert,
			UnassignStaffProfilePermission.HandleUnassignStaffProfilePermission
		)
			.WithName("UnassignStaffProfilePermission")
			.WithSummary("Unassign a permission key from a staff profile")
			.WithPermission([AppPermissions.Staff.Profiles.UPDATE_FOR_STAFF]);

		staffGroup.MapGet(
			Routes.Profiles.ForStaff.Users.Find,
			FindStaffProfileUsers.HandleFindStaffProfileUsers
		)
			.WithName("FindStaffProfileUsers")
			.WithSummary("Find users assigned to a staff profile")
			// This permission is intentionally separate from profile read/write permissions:
			// listing assigned users is a distinct capability from editing the profile itself.
			.WithPermission([AppPermissions.Staff.Profiles.LIST_USERS_FOR_STAFF_PROFILE])
			.WithReqQueryValidation<FindStaffProfileUsersQuery>();

		staffGroup.MapPost(
			Routes.Profiles.ForStaff.Users.ResolveAssignment,
			ResolveStaffProfileUserAssignments.HandleResolveStaffProfileUserAssignments
		)
			.WithName("ResolveStaffProfileUserAssignments")
			.WithSummary("Resolve whether staff users are assigned to a staff profile (batch)")
			.WithPermission([AppPermissions.Staff.Profiles.LIST_USERS_FOR_STAFF_PROFILE])
			.WithReqBodyValidation<ResolveStaffProfileUserAssignmentsBody>();

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
