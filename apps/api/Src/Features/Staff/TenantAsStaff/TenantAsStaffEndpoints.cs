using MainApi.Src.Lib;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Features.Staff.TenantAsStaff.Handlers;

namespace MainApi.Src.Features.Staff.TenantAsStaff;

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
			.WithPermission([PermissionEnum.Staff.CAN_CREATE_TENANT])
			.ProducesApiResponses(StatusCodes.Status500InternalServerError);

		group.MapGet(
			PathUtils.GetLastSegment(RoutePath.Staff.Tenants.GetById),
			GetTenantAsStaff.HandleGetTenantAsStaff
		)
			.WithName("GetTenantById")
			.WithSummary("Get a tenant by id")
			.WithPermission([PermissionEnum.Staff.CAN_GET_TENANT])
			.ProducesApiResponses(StatusCodes.Status500InternalServerError);

		group.MapGet(
			PathUtils.GetLastSegment(RoutePath.Staff.Tenants.Find),
			FindTenantsAsStaff.HandleFindTenantsAsStaff
		)
			.WithName("FindTenants")
			.WithSummary("Find tenants with pagination")
			.WithReqQueryValidation<FindTenantsAsStaffQuery>()
			.WithPermission([PermissionEnum.Staff.CAN_LIST_TENANTS])
			.ProducesApiResponses(StatusCodes.Status500InternalServerError);

		return group;
	}
}
