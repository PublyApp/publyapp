using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.Roles.Handlers.Staff;

namespace PublyApp.Api.Modules.Roles.Endpoints;

public static class RoleEndpointsForStaff {
	public static IEndpointRouteBuilder MapRoleEndpointsForStaff(
		this IEndpointRouteBuilder routes
	) {
		// Staff role routes: /staff/roles
		var staffGroup = routes.MapGroup(Routes.Roles.ForStaff.Root)
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithTags("Staff Roles");

		staffGroup.MapGet(
			Routes.Roles.ForStaff.Find,
			FindStaffRoles.Handle
		)
			.WithName("FindStaffRoles")
			.RequireRateLimiting(
				ApiRateLimitPolicies.HeavySearchList
			)
			.WithSummary("Find roles for a staff member")
			.WithPermission([AppPermissions.Staff.Roles.LIST_FOR_STAFF])
			.WithReqQueryValidation<FindStaffRolesQuery>();

		staffGroup.MapPost(
			Routes.Roles.ForStaff.Create,
			CreateStaffRole.Handle
		)
			.WithName("CreateStaffRole")
			.RequireRateLimiting(
				ApiRateLimitPolicies.EmailOperation
			)
			.WithSummary("Create a new staff role")
			.WithPermission([AppPermissions.Staff.Roles.CREATE_FOR_STAFF])
			.WithReqBodyValidation<CreateStaffRoleBody>()
			.WithRecipientWeightedRateLimit<
				CreateStaffRoleBody
			>(
				ApiRateLimitPolicies.EmailOperation,
				body => body.GetEmails().Count
			);

		staffGroup.MapGet(
			Routes.Roles.ForStaff.Get,
			GetStaffRoleById.Handle
		)
			.WithName("GetStaffRoleById")
			.WithSummary("Get a staff role by id")
			.WithPermission([AppPermissions.Staff.Roles.GET_FOR_STAFF]);

		staffGroup.MapDelete(
			Routes.Roles.ForStaff.Delete,
			DeleteStaffRole.Handle
		)
			.WithName("DeleteStaffRole")
			.WithSummary("Delete a staff role")
			// Delete is intentionally separate from UPDATE permission so operators can
			// manage role contents without automatically gaining destructive access.
			.WithPermission([AppPermissions.Staff.Roles.DELETE_FOR_STAFF]);

		staffGroup.MapPost(
			Routes.Roles.ForStaff.BulkDelete,
			BulkDeleteStaffRoles.Handle
		)
			.WithName("BulkDeleteStaffRoles")
			.RequireRateLimiting(
				ApiRateLimitPolicies.BulkOperation
			)
			.WithSummary("Bulk delete staff roles")
			// Use the same delete permission as single deletes; this endpoint performs
			// one request for a multi-id payload.
			.WithPermission([AppPermissions.Staff.Roles.DELETE_FOR_STAFF])
			.WithReqBodyValidation<BulkDeleteStaffRolesBody>();

		staffGroup.MapPatch(
			Routes.Roles.ForStaff.Update,
			UpdateStaffRole.Handle
		)
			.WithName("UpdateStaffRole")
			.WithSummary("Update a staff role (name/description)")
			// Reuse the same update permission for both role detail edits and permission assignment:
			// if you can change what a role *means*, you can change its attached permissions.
			.WithPermission([AppPermissions.Staff.Roles.UPDATE_FOR_STAFF])
			.WithReqBodyValidation<UpdateStaffRoleBody>();

		staffGroup.MapGet(
			Routes.Roles.ForStaff.Permissions.Find,
			FindStaffRolePermissions.Handle
		)
			.WithName("FindStaffRolePermissions")
			.RequireRateLimiting(
				ApiRateLimitPolicies.HeavySearchList
			)
			.WithSummary("List permission keys assigned to a staff role")
			// Treat "read permissions for role" as part of role read access.
			.WithPermission([AppPermissions.Staff.Roles.GET_FOR_STAFF]);

		staffGroup.MapPost(
			Routes.Roles.ForStaff.Permissions.Upsert,
			AssignStaffRolePermission.Handle
		)
			.WithName("AssignStaffRolePermission")
			.WithSummary("Assign a permission key to a staff role")
			.WithPermission([AppPermissions.Staff.Roles.UPDATE_FOR_STAFF]);

		staffGroup.MapDelete(
			Routes.Roles.ForStaff.Permissions.Upsert,
			UnassignStaffRolePermission.Handle
		)
			.WithName("UnassignStaffRolePermission")
			.WithSummary("Unassign a permission key from a staff role")
			.WithPermission([AppPermissions.Staff.Roles.UPDATE_FOR_STAFF]);

		staffGroup.MapGet(
			Routes.Roles.ForStaff.Users.Find,
			FindStaffRoleUsers.Handle
		)
			.WithName("FindStaffRoleUsers")
			.RequireRateLimiting(
				ApiRateLimitPolicies.HeavySearchList
			)
			.WithSummary("Find users assigned to a staff role")
			// This permission is intentionally separate from role read/write permissions:
			// listing assigned users is a distinct capability from editing the role itself.
			.WithPermission([AppPermissions.Staff.Roles.LIST_USERS_FOR_STAFF_ROLE])
			.WithReqQueryValidation<FindStaffRoleUsersQuery>();

		staffGroup.MapPost(
			Routes.Roles.ForStaff.Users.ResolveAssignment,
			ResolveStaffRoleUserAssignments.Handle
		)
			.WithName("ResolveStaffRoleUserAssignments")
			.RequireRateLimiting(
				ApiRateLimitPolicies.HeavySearchList
			)
			.WithSummary("Resolve whether staff users are assigned to a staff role (batch)")
			.WithPermission([AppPermissions.Staff.Roles.LIST_USERS_FOR_STAFF_ROLE])
			.WithReqBodyValidation<ResolveStaffRoleUserAssignmentsBody>();

		staffGroup.MapPost(
			Routes.Roles.ForStaff.Users.Assign,
			BulkAssignStaffRoleUsers.Handle
		)
			.WithName("BulkAssignStaffRoleUsers")
			.RequireRateLimiting(
				ApiRateLimitPolicies.BulkOperation
			)
			.WithSummary("Bulk-assign staff users to a staff role")
			// Same permission as unassign: membership is part of managing what the role
			// applies to. Handing out the full-access role additionally requires holding
			// it (RoleAssignmentGuard).
			.WithPermission([AppPermissions.Staff.Roles.UPDATE_FOR_STAFF])
			.WithReqBodyValidation<BulkAssignStaffRoleUsersBody>();

		staffGroup.MapPost(
			Routes.Roles.ForStaff.Users.Unassign,
			UnassignStaffRoleUsers.Handle
		)
			.WithName("UnassignStaffRoleUsers")
			.RequireRateLimiting(
				ApiRateLimitPolicies.BulkOperation
			)
			.WithSummary("Bulk-unassign staff users from a staff role")
			// Reuse UPDATE permission: assignment membership is part of managing what the
			// role applies to, even though it is exposed as a dedicated bulk route.
			.WithPermission([AppPermissions.Staff.Roles.UPDATE_FOR_STAFF])
			.WithReqBodyValidation<UnassignStaffRoleUsersBody>();

		// Tenant role routes (viewed by staff): /staff/tenants/{tenantId}/roles
		var tenantGroup = routes.MapGroup(Routes.Roles.ForTenantAsStaff.Root)
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithTags("Tenant Roles (Staff View)");

		tenantGroup.MapGet(
			Routes.Roles.ForTenantAsStaff.Find,
			FindTenantRolesAsStaff.Handle
		)
			.WithName("FindTenantRoles")
			.RequireRateLimiting(
				ApiRateLimitPolicies.HeavySearchList
			)
			.WithSummary("Find roles for a tenant")
			.WithPermission([AppPermissions.Staff.Roles.LIST_FOR_TENANT])
			.WithReqQueryValidation<FindTenantRolesAsStaffQuery>();

		tenantGroup.MapGet(
			Routes.Roles.ForTenantAsStaff.Get,
			GetTenantRoleByIdAsStaff.Handle
		)
			.WithName("GetTenantRoleByIdAsStaff")
			.WithSummary("Get a tenant role by id")
			.WithPermission([AppPermissions.Staff.Roles.GET_FOR_TENANT]);

		tenantGroup.MapPost(
			Routes.Roles.ForTenantAsStaff.Create,
			CreateTenantRoleAsStaff.Handle
		)
			.WithName("CreateTenantRoleAsStaff")
			.WithSummary("Create a tenant role")
			.WithPermission([AppPermissions.Staff.Roles.CREATE_FOR_TENANT])
			.WithReqBodyValidation<CreateTenantRoleAsStaffBody>();

		tenantGroup.MapPatch(
			Routes.Roles.ForTenantAsStaff.Update,
			UpdateTenantRoleAsStaff.Handle
		)
			.WithName("UpdateTenantRoleAsStaff")
			.WithSummary("Update a tenant role")
			.WithPermission([AppPermissions.Staff.Roles.UPDATE_FOR_TENANT])
			.WithReqBodyValidation<UpdateTenantRoleAsStaffBody>();

		tenantGroup.MapDelete(
			Routes.Roles.ForTenantAsStaff.Delete,
			DeleteTenantRoleAsStaff.Handle
		)
			.WithName("DeleteTenantRoleAsStaff")
			.WithSummary("Delete a tenant role")
			.WithPermission([AppPermissions.Staff.Roles.DELETE_FOR_TENANT]);

		tenantGroup.MapPost(
			Routes.Roles.ForTenantAsStaff.BulkDelete,
			BulkDeleteTenantRolesAsStaff.Handle
		)
			.WithName("BulkDeleteTenantRolesAsStaff")
			.RequireRateLimiting(
				ApiRateLimitPolicies.TenantBulkOperation
			)
			.WithSummary("Bulk delete tenant roles")
			// Keep tenant scope on this endpoint to prevent cross-tenant role deletion.
			.WithPermission([AppPermissions.Staff.Roles.DELETE_FOR_TENANT])
			.WithReqBodyValidation<BulkDeleteTenantRolesBody>();

		tenantGroup.MapGet(
			Routes.Roles.ForTenantAsStaff.Permissions.Find,
			FindTenantRolePermissionsAsStaff.Handle
		)
			.WithName("FindTenantRolePermissionsAsStaff")
			.RequireRateLimiting(
				ApiRateLimitPolicies.HeavySearchList
			)
			.WithSummary("List permission keys assigned to a tenant role")
			.WithPermission([AppPermissions.Staff.Roles.GET_FOR_TENANT]);

		tenantGroup.MapPost(
			Routes.Roles.ForTenantAsStaff.Permissions.Upsert,
			AssignTenantRolePermissionAsStaff.Handle
		)
			.WithName("AssignTenantRolePermissionAsStaff")
			.WithSummary("Assign a permission key to a tenant role")
			.WithPermission([AppPermissions.Staff.Roles.UPDATE_FOR_TENANT]);

		tenantGroup.MapDelete(
			Routes.Roles.ForTenantAsStaff.Permissions.Upsert,
			UnassignTenantRolePermissionAsStaff.Handle
		)
			.WithName("UnassignTenantRolePermissionAsStaff")
			.WithSummary("Unassign a permission key from a tenant role")
			.WithPermission([AppPermissions.Staff.Roles.UPDATE_FOR_TENANT]);

		tenantGroup.MapGet(
			Routes.Roles.ForTenantAsStaff.Users.Find,
			FindTenantRoleUsersAsStaff.Handle
		)
			.WithName("FindTenantRoleUsersAsStaff")
			.RequireRateLimiting(
				ApiRateLimitPolicies.HeavySearchList
			)
			.WithSummary("Find tenant members assigned to a tenant role")
			// Distinct from GET_FOR_TENANT/UPDATE_FOR_TENANT, mirroring
			// LIST_USERS_FOR_STAFF_ROLE on the staff-roles axis: listing assigned members
			// is a distinct read capability from viewing or editing the role itself.
			.WithPermission([AppPermissions.Staff.Roles.LIST_USERS_FOR_TENANT_ROLE])
			.WithReqQueryValidation<FindTenantRoleUsersAsStaffQuery>();

		tenantGroup.MapPost(
			Routes.Roles.ForTenantAsStaff.Users.ResolveAssignment,
			ResolveTenantRoleUserAssignmentsAsStaff.Handle
		)
			.WithName("ResolveTenantRoleUserAssignmentsAsStaff")
			.RequireRateLimiting(
				ApiRateLimitPolicies.HeavySearchList
			)
			.WithSummary("Resolve whether tenant members are assigned to a tenant role (batch)")
			.WithPermission([AppPermissions.Staff.Roles.LIST_USERS_FOR_TENANT_ROLE])
			.WithReqBodyValidation<ResolveTenantRoleUserAssignmentsAsStaffBody>();

		tenantGroup.MapPost(
			Routes.Roles.ForTenantAsStaff.Users.Upsert,
			AssignTenantRoleUserAsStaff.Handle
		)
			.WithName("AssignTenantRoleUserAsStaff")
			.WithSummary("Assign a tenant role to a tenant member")
			// AND of both permissions (PermissionFilter default). Membership is a write on the
			// role (UPDATE_FOR_TENANT, as for permission assignment), but it also changes
			// what a specific user can do, so it additionally requires the tenant-user update
			// permission. Requiring both is strictly narrower than either alone, so this
			// cannot widen access for any existing role holder.
			.WithPermission([
				AppPermissions.Staff.Roles.UPDATE_FOR_TENANT,
				AppPermissions.Staff.Users.UPDATE_FOR_TENANT
			]);

		tenantGroup.MapDelete(
			Routes.Roles.ForTenantAsStaff.Users.Upsert,
			UnassignTenantRoleUserAsStaff.Handle
		)
			.WithName("UnassignTenantRoleUserAsStaff")
			.WithSummary("Unassign a tenant role from a tenant member")
			// Same permission pair as assign: revoking a member's role is as
			// security-relevant as granting it.
			.WithPermission([
				AppPermissions.Staff.Roles.UPDATE_FOR_TENANT,
				AppPermissions.Staff.Users.UPDATE_FOR_TENANT
			]);

		tenantGroup.MapPost(
			Routes.Roles.ForTenantAsStaff.ResolveNames,
			ResolveTenantRoleNamesAsStaff.Handle
		)
			.WithName("ResolveTenantRoleNamesAsStaff")
			.RequireRateLimiting(
				ApiRateLimitPolicies.HeavySearchList
			)
			.WithSummary("Resolve tenant role names to role ids (batch)")
			// Read-only resolution of the tenant's own role catalogue: same capability
			// as listing roles, exposed as a POST batch like the sibling assignment
			// resolution endpoint above.
			.WithPermission([AppPermissions.Staff.Roles.LIST_FOR_TENANT])
			.WithReqBodyValidation<ResolveTenantRoleNamesAsStaffBody>();

		return routes;
	}
}
