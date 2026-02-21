using MainApi.Src.Lib;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Modules.Tenants.Handlers.Staff;

namespace MainApi.Src.Modules.Tenants.Endpoints;

public static class TenantEndpointsForStaff {
	public static IEndpointRouteBuilder MapTenantEndpointsForStaff(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(Routes.Tenants.ForStaff.Root)
			.WithTags("Tenants");

		group.MapPost(
			Routes.Tenants.ForStaff.Create,
			CreateTenantAsStaff.HandleCreateTenantAsStaff
		)
			.WithName("CreateTenant")
			.WithSummary("Create a new tenant")
			.WithReqBodyValidation<CreateTenantAsStaffBody>()
			.WithPermission([AppPermissions.Staff.Tenants.CREATE]);

		group.MapGet(
			Routes.Tenants.ForStaff.GetById,
			GetTenantAsStaff.HandleGetTenantAsStaff
		)
			.WithName("GetTenantById")
			.WithSummary("Get a tenant by id")
			.WithPermission([AppPermissions.Staff.Tenants.GET]);

		group.MapGet(
			Routes.Tenants.ForStaff.Find,
			FindTenantsAsStaff.HandleFindTenantsAsStaff
		)
			.WithName("FindTenants")
			.WithSummary("Find tenants with pagination")
			.WithReqQueryValidation<FindTenantsAsStaffQuery>()
			.WithPermission([AppPermissions.Staff.Tenants.LIST]);

		group.MapPatch(
			Routes.Tenants.ForStaff.Update,
			UpdateTenantAsStaff.HandleUpdateTenantAsStaff
		)
			.WithName("UpdateTenant")
			.WithSummary("Update a tenant")
			.WithReqBodyValidation<UpdateTenantAsStaffBody>()
			.WithPermission(
				[AppPermissions.Staff.Tenants.UPDATE]
			);

		group.MapPost(
			Routes.Tenants.ForStaff.Suspend,
			SuspendTenantAsStaff.HandleSuspendTenantAsStaff
		)
			.WithName("SuspendTenant")
			.WithSummary("Suspend a tenant")
			.WithReqBodyValidation<SuspendTenantAsStaffBody>()
			.WithPermission([AppPermissions.Staff.Tenants.SUSPEND]);

		group.MapPost(
			Routes.Tenants.ForStaff.Reactivate,
			ReactivateTenantAsStaff.HandleReactivateTenantAsStaff
		)
			.WithName("ReactivateTenant")
			.WithSummary("Reactivate a suspended tenant")
			.WithPermission([AppPermissions.Staff.Tenants.REACTIVATE]);

		group.MapDelete(
			Routes.Tenants.ForStaff.Delete,
			DeleteTenantAsStaff.HandleDeleteTenantAsStaff
		)
			.WithName("DeleteTenant")
			.WithSummary("Soft-delete a suspended tenant")
			.WithPermission(
				[AppPermissions.Staff.Tenants.DELETE]
			);

		return routes;
	}
}
