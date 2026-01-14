using MainApi.Src.Lib;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Tenants.Handlers.Staff;

namespace MainApi.Src.Modules.Tenants.Endpoints;

public static class TenantEndpointsForStaff {
	public static IEndpointRouteBuilder MapTenantEndpointsForStaff(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(PathUtils.GetLastSegment(Routes.Tenants.ForStaff.Root))
			.WithTags("Tenants");

		group.MapPost(
			PathUtils.GetLastSegment(Routes.Tenants.ForStaff.Create),
			CreateTenantAsStaff.HandleCreateTenantAsStaff
		)
			.WithName("CreateTenant")
			.WithSummary("Create a new tenant")
			.WithReqBodyValidation<CreateTenantAsStaffBody>()
			.WithPermission([AppPermissions.Staff.Tenants.CREATE]);

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Tenants.ForStaff.GetById),
			GetTenantAsStaff.HandleGetTenantAsStaff
		)
			.WithName("GetTenantById")
			.WithSummary("Get a tenant by id")
			.WithPermission([AppPermissions.Staff.Tenants.GET]);

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Tenants.ForStaff.Find),
			FindTenantsAsStaff.HandleFindTenantsAsStaff
		)
			.WithName("FindTenants")
			.WithSummary("Find tenants with pagination")
			.WithReqQueryValidation<FindTenantsAsStaffQuery>()
			.WithPermission([AppPermissions.Staff.Tenants.LIST]);

		return group;
	}
}
