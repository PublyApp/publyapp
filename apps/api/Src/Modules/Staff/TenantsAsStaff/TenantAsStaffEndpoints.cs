using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Staff.TenantsAsStaff.Handlers;

namespace MainApi.Src.Modules.Staff.TenantsAsStaff;

public static class TenantAsStaffEndpoints {
	public static IEndpointRouteBuilder MapTenantAsStaffEndpoints(this IEndpointRouteBuilder routes) {
		var group = routes.MapGroup(PathUtils.GetLastSegment(RoutePath.Staff.Tenants.Root))
			.WithTags("Tenants")
			.WithOpenApi();

		group.MapPost(
			PathUtils.GetLastSegment(RoutePath.Staff.Tenants.Create),
			CreateTenantAsStaff.HandleCreateTenantAsStaff
		)
			.WithName("CreateTenant")
			.WithSummary("Create a new tenant")
			.WithReqBodyValidation<CreateTenantAsStaffBody>()
			.WithPermission([AppPermissions.Staff.Tenants.CREATE])
			.ProducesApiResponses(StatusCodes.Status500InternalServerError);

		group.MapGet(
			PathUtils.GetLastSegment(RoutePath.Staff.Tenants.GetById),
			GetTenantAsStaff.HandleGetTenantAsStaff
		)
			.WithName("GetTenantById")
			.WithSummary("Get a tenant by id")
			.WithPermission([AppPermissions.Staff.Tenants.GET])
			.ProducesApiResponses(StatusCodes.Status500InternalServerError);

		group.MapGet(
			PathUtils.GetLastSegment(RoutePath.Staff.Tenants.Find),
			FindTenantsAsStaff.HandleFindTenantsAsStaff
		)
			.WithName("FindTenants")
			.WithSummary("Find tenants with pagination")
			.WithReqQueryValidation<FindTenantsAsStaffQuery>()
			.WithPermission([AppPermissions.Staff.Tenants.LIST])
			.ProducesApiResponses(StatusCodes.Status500InternalServerError);

		return group;
	}
}
