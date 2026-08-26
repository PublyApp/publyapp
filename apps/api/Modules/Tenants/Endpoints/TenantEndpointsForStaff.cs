using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.Tenants.Handlers.Staff;

namespace PublyApp.Api.Modules.Tenants.Endpoints;

public static class TenantEndpointsForStaff {
	public static IEndpointRouteBuilder MapTenantEndpointsForStaff(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(Routes.Tenants.ForStaff.Root)
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithTags("Tenants");

		group.MapPost(
			Routes.Tenants.ForStaff.Create,
			CreateTenantAsStaff.Handle
		)
			.WithName("CreateTenant")
			.RequireRateLimiting(
				ApiRateLimitPolicies.EmailOperation
			)
			.WithSummary("Create a new tenant")
			.WithReqBodyValidation<CreateTenantAsStaffBody>()
			.WithRecipientWeightedRateLimit<
				CreateTenantAsStaffBody
			>(
				ApiRateLimitPolicies.EmailOperation,
				body => body.GetInitialUsers().Count
			)
			.WithPermission([AppPermissions.Staff.Tenants.CREATE]);

		group.MapGet(
			Routes.Tenants.ForStaff.GetById,
			GetTenantAsStaff.Handle
		)
			.WithName("GetTenantById")
			.WithSummary("Get a tenant by id")
			.WithPermission([AppPermissions.Staff.Tenants.GET]);

		group.MapGet(
			Routes.Tenants.ForStaff.Usage,
			GetTenantUsageAsStaff.Handle
		)
			.WithName("GetTenantUsage")
			.WithSummary("Get aggregated usage metrics for a tenant")
			.WithPermission([AppPermissions.Staff.Tenants.GET]);

		group.MapGet(
			Routes.Tenants.ForStaff.Find,
			FindTenantsAsStaff.Handle
		)
			.WithName("FindTenants")
			.RequireRateLimiting(
				ApiRateLimitPolicies.HeavySearchList
			)
			.WithSummary("Find tenants with pagination")
			.WithReqQueryValidation<FindTenantsAsStaffQuery>()
			.WithPermission([AppPermissions.Staff.Tenants.LIST]);

		group.MapPatch(
			Routes.Tenants.ForStaff.Update,
			UpdateTenantAsStaff.Handle
		)
			.WithName("UpdateTenant")
			.WithSummary("Update a tenant")
			.WithReqBodyValidation<UpdateTenantAsStaffBody>()
			.WithPermission(
				[AppPermissions.Staff.Tenants.UPDATE]
			);

		group.MapPost(
			Routes.Tenants.ForStaff.Suspend,
			SuspendTenantAsStaff.Handle
		)
			.WithName("SuspendTenant")
			.WithSummary("Suspend a tenant")
			.WithReqBodyValidation<SuspendTenantAsStaffBody>()
			.WithPermission([AppPermissions.Staff.Tenants.SUSPEND]);

		group.MapPost(
			Routes.Tenants.ForStaff.Reactivate,
			ReactivateTenantAsStaff.Handle
		)
			.WithName("ReactivateTenant")
			.WithSummary("Reactivate a suspended tenant")
			.WithPermission([AppPermissions.Staff.Tenants.REACTIVATE]);

		group.MapDelete(
			Routes.Tenants.ForStaff.Delete,
			DeleteTenantAsStaff.Handle
		)
			.WithName("DeleteTenant")
			.WithSummary("Soft-delete a suspended tenant")
			.WithPermission(
				[AppPermissions.Staff.Tenants.DELETE]
			);

		group.MapPost(
			Routes.Tenants.ForStaff.BulkSuspend,
			BulkSuspendTenantsAsStaff.Handle
		)
			.WithName("BulkSuspendTenants")
			.RequireRateLimiting(
				ApiRateLimitPolicies.BulkOperation
			)
			.WithSummary("Bulk suspend tenants")
			.WithReqBodyValidation<BulkSuspendTenantsAsStaffBody>()
			.WithPermission([AppPermissions.Staff.Tenants.SUSPEND]);

		group.MapPost(
			Routes.Tenants.ForStaff.BulkReactivate,
			BulkReactivateTenantsAsStaff.Handle
		)
			.WithName("BulkReactivateTenants")
			.RequireRateLimiting(
				ApiRateLimitPolicies.BulkOperation
			)
			.WithSummary("Bulk reactivate tenants")
			.WithReqBodyValidation<BulkReactivateTenantsAsStaffBody>()
			.WithPermission([AppPermissions.Staff.Tenants.REACTIVATE]);

		group.MapPost(
			Routes.Tenants.ForStaff.BulkDelete,
			BulkDeleteTenantsAsStaff.Handle
		)
			.WithName("BulkDeleteTenants")
			.RequireRateLimiting(
				ApiRateLimitPolicies.BulkOperation
			)
			.WithSummary("Bulk delete tenants")
			.WithReqBodyValidation<BulkDeleteTenantsAsStaffBody>()
			.WithPermission([AppPermissions.Staff.Tenants.DELETE]);

		return routes;
	}
}
