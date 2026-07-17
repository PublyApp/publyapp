using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.Profiles.Handlers.Staff;

namespace PublyApp.Api.Modules.Profiles.Endpoints;

public static class ProfileEndpointsForStaff {
	public static IEndpointRouteBuilder MapProfileEndpointsForStaff(
		this IEndpointRouteBuilder routes
	) {
		// Staff profile routes: /staff/profiles
		var staffGroup = routes.MapGroup(Routes.Profiles.ForStaff.Root)
			.WithTags("Staff Profiles");

		staffGroup.MapGet(
			Routes.Profiles.ForStaff.Find,
			FindStaffProfiles.Handle
		)
			.WithName("FindStaffProfiles")
			.WithSummary("Find profiles for a staff member")
			.WithPermission([AppPermissions.Staff.Profiles.LIST_FOR_STAFF])
			.WithReqQueryValidation<FindStaffProfilesQuery>();

		staffGroup.MapPost(
			Routes.Profiles.ForStaff.Create,
			CreateStaffProfile.Handle
		)
			.WithName("CreateStaffProfile")
			.WithSummary("Create a new staff profile")
			.WithPermission([AppPermissions.Staff.Profiles.CREATE_FOR_STAFF])
			.WithReqBodyValidation<CreateStaffProfileBody>();

		staffGroup.MapGet(
			Routes.Profiles.ForStaff.Get,
			GetStaffProfileById.Handle
		)
			.WithName("GetStaffProfileById")
			.WithSummary("Get a staff profile by id")
			.WithPermission([AppPermissions.Staff.Profiles.GET_FOR_STAFF]);

		staffGroup.MapDelete(
			Routes.Profiles.ForStaff.Delete,
			DeleteStaffProfile.Handle
		)
			.WithName("DeleteStaffProfile")
			.WithSummary("Delete a staff profile")
			// Delete is intentionally separate from UPDATE permission so operators can
			// manage profile contents without automatically gaining destructive access.
			.WithPermission([AppPermissions.Staff.Profiles.DELETE_FOR_STAFF]);

		staffGroup.MapPost(
			Routes.Profiles.ForStaff.BulkDelete,
			BulkDeleteStaffProfiles.Handle
		)
			.WithName("BulkDeleteStaffProfiles")
			.WithSummary("Bulk delete staff profiles")
			// Use the same delete permission as single deletes; this endpoint performs
			// one request for a multi-id payload.
			.WithPermission([AppPermissions.Staff.Profiles.DELETE_FOR_STAFF])
			.WithReqBodyValidation<BulkDeleteStaffProfilesBody>();

		staffGroup.MapPatch(
			Routes.Profiles.ForStaff.Update,
			UpdateStaffProfile.Handle
		)
			.WithName("UpdateStaffProfile")
			.WithSummary("Update a staff profile (name/description)")
			// Reuse the same update permission for both profile detail edits and permission assignment:
			// if you can change what a profile *means*, you can change its attached permissions.
			.WithPermission([AppPermissions.Staff.Profiles.UPDATE_FOR_STAFF])
			.WithReqBodyValidation<UpdateStaffProfileBody>();

		staffGroup.MapGet(
			Routes.Profiles.ForStaff.Permissions.Find,
			FindStaffProfilePermissions.Handle
		)
			.WithName("FindStaffProfilePermissions")
			.WithSummary("List permission keys assigned to a staff profile")
			// Treat "read permissions for profile" as part of profile read access.
			.WithPermission([AppPermissions.Staff.Profiles.GET_FOR_STAFF]);

		staffGroup.MapPost(
			Routes.Profiles.ForStaff.Permissions.Upsert,
			AssignStaffProfilePermission.Handle
		)
			.WithName("AssignStaffProfilePermission")
			.WithSummary("Assign a permission key to a staff profile")
			.WithPermission([AppPermissions.Staff.Profiles.UPDATE_FOR_STAFF]);

		staffGroup.MapDelete(
			Routes.Profiles.ForStaff.Permissions.Upsert,
			UnassignStaffProfilePermission.Handle
		)
			.WithName("UnassignStaffProfilePermission")
			.WithSummary("Unassign a permission key from a staff profile")
			.WithPermission([AppPermissions.Staff.Profiles.UPDATE_FOR_STAFF]);

		staffGroup.MapGet(
			Routes.Profiles.ForStaff.Users.Find,
			FindStaffProfileUsers.Handle
		)
			.WithName("FindStaffProfileUsers")
			.WithSummary("Find users assigned to a staff profile")
			// This permission is intentionally separate from profile read/write permissions:
			// listing assigned users is a distinct capability from editing the profile itself.
			.WithPermission([AppPermissions.Staff.Profiles.LIST_USERS_FOR_STAFF_PROFILE])
			.WithReqQueryValidation<FindStaffProfileUsersQuery>();

		staffGroup.MapPost(
			Routes.Profiles.ForStaff.Users.ResolveAssignment,
			ResolveStaffProfileUserAssignments.Handle
		)
			.WithName("ResolveStaffProfileUserAssignments")
			.WithSummary("Resolve whether staff users are assigned to a staff profile (batch)")
			.WithPermission([AppPermissions.Staff.Profiles.LIST_USERS_FOR_STAFF_PROFILE])
			.WithReqBodyValidation<ResolveStaffProfileUserAssignmentsBody>();

		staffGroup.MapPost(
			Routes.Profiles.ForStaff.Users.Unassign,
			UnassignStaffProfileUsers.Handle
		)
			.WithName("UnassignStaffProfileUsers")
			.WithSummary("Bulk-unassign staff users from a staff profile")
			// Reuse UPDATE permission: assignment membership is part of managing what the
			// profile applies to, even though it is exposed as a dedicated bulk route.
			.WithPermission([AppPermissions.Staff.Profiles.UPDATE_FOR_STAFF])
			.WithReqBodyValidation<UnassignStaffProfileUsersBody>();

		// Tenant profile routes (viewed by staff): /staff/tenants/{tenantId}/profiles
		var tenantGroup = routes.MapGroup(Routes.Profiles.ForTenantAsStaff.Root)
			.WithTags("Tenant Profiles (Staff View)");

		tenantGroup.MapGet(
			Routes.Profiles.ForTenantAsStaff.Find,
			FindTenantProfilesAsStaff.Handle
		)
			.WithName("FindTenantProfiles")
			.WithSummary("Find profiles for a tenant")
			.WithPermission([AppPermissions.Staff.Profiles.LIST_FOR_TENANT])
			.WithReqQueryValidation<FindTenantProfilesAsStaffQuery>();

		tenantGroup.MapGet(
			Routes.Profiles.ForTenantAsStaff.Get,
			GetTenantProfileByIdAsStaff.Handle
		)
			.WithName("GetTenantProfileByIdAsStaff")
			.WithSummary("Get a tenant profile by id")
			.WithPermission([AppPermissions.Staff.Profiles.GET_FOR_TENANT]);

		tenantGroup.MapPost(
			Routes.Profiles.ForTenantAsStaff.Create,
			CreateTenantProfileAsStaff.Handle
		)
			.WithName("CreateTenantProfileAsStaff")
			.WithSummary("Create a tenant profile")
			.WithPermission([AppPermissions.Staff.Profiles.CREATE_FOR_TENANT])
			.WithReqBodyValidation<CreateTenantProfileAsStaffBody>();

		tenantGroup.MapPatch(
			Routes.Profiles.ForTenantAsStaff.Update,
			UpdateTenantProfileAsStaff.Handle
		)
			.WithName("UpdateTenantProfileAsStaff")
			.WithSummary("Update a tenant profile")
			.WithPermission([AppPermissions.Staff.Profiles.UPDATE_FOR_TENANT])
			.WithReqBodyValidation<UpdateTenantProfileAsStaffBody>();

		tenantGroup.MapDelete(
			Routes.Profiles.ForTenantAsStaff.Delete,
			DeleteTenantProfileAsStaff.Handle
		)
			.WithName("DeleteTenantProfileAsStaff")
			.WithSummary("Delete a tenant profile")
			.WithPermission([AppPermissions.Staff.Profiles.DELETE_FOR_TENANT]);

		tenantGroup.MapPost(
			Routes.Profiles.ForTenantAsStaff.BulkDelete,
			BulkDeleteTenantProfilesAsStaff.Handle
		)
			.WithName("BulkDeleteTenantProfilesAsStaff")
			.WithSummary("Bulk delete tenant profiles")
			// Keep tenant scope on this endpoint to prevent cross-tenant profile deletion.
			.WithPermission([AppPermissions.Staff.Profiles.DELETE_FOR_TENANT])
			.WithReqBodyValidation<BulkDeleteTenantProfilesBody>();

		tenantGroup.MapGet(
			Routes.Profiles.ForTenantAsStaff.Permissions.Find,
			FindTenantProfilePermissionsAsStaff.Handle
		)
			.WithName("FindTenantProfilePermissionsAsStaff")
			.WithSummary("List permission keys assigned to a tenant profile")
			.WithPermission([AppPermissions.Staff.Profiles.GET_FOR_TENANT]);

		tenantGroup.MapPost(
			Routes.Profiles.ForTenantAsStaff.Permissions.Upsert,
			AssignTenantProfilePermissionAsStaff.Handle
		)
			.WithName("AssignTenantProfilePermissionAsStaff")
			.WithSummary("Assign a permission key to a tenant profile")
			.WithPermission([AppPermissions.Staff.Profiles.UPDATE_FOR_TENANT]);

		tenantGroup.MapDelete(
			Routes.Profiles.ForTenantAsStaff.Permissions.Upsert,
			UnassignTenantProfilePermissionAsStaff.Handle
		)
			.WithName("UnassignTenantProfilePermissionAsStaff")
			.WithSummary("Unassign a permission key from a tenant profile")
			.WithPermission([AppPermissions.Staff.Profiles.UPDATE_FOR_TENANT]);

		tenantGroup.MapPost(
			Routes.Profiles.ForTenantAsStaff.Users.Upsert,
			AssignTenantProfileUserAsStaff.Handle
		)
			.WithName("AssignTenantProfileUserAsStaff")
			.WithSummary("Assign a tenant profile to a tenant member")
			// AND of both permissions (PermissionFilter default). Membership is a write on the
			// profile (UPDATE_FOR_TENANT, as for permission assignment), but it also changes
			// what a specific user can do, so it additionally requires the tenant-user update
			// permission. Requiring both is strictly narrower than either alone, so this
			// cannot widen access for any existing profile holder.
			.WithPermission([
				AppPermissions.Staff.Profiles.UPDATE_FOR_TENANT,
				AppPermissions.Staff.Users.UPDATE_FOR_TENANT
			]);

		tenantGroup.MapDelete(
			Routes.Profiles.ForTenantAsStaff.Users.Upsert,
			UnassignTenantProfileUserAsStaff.Handle
		)
			.WithName("UnassignTenantProfileUserAsStaff")
			.WithSummary("Unassign a tenant profile from a tenant member")
			// Same permission pair as assign: revoking a member's profile is as
			// security-relevant as granting it.
			.WithPermission([
				AppPermissions.Staff.Profiles.UPDATE_FOR_TENANT,
				AppPermissions.Staff.Users.UPDATE_FOR_TENANT
			]);

		return routes;
	}
}
