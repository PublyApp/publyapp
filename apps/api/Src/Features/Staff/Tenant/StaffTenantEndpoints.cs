using MainApi.Src.Features.Staff.Tenant.Handlers;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Lib.Extensions;

namespace MainApi.Src.Features.Staff.Tenant;

public static class StaffTenantEndpoints {
	public static IEndpointRouteBuilder MapStaffTenantEndpoints(this IEndpointRouteBuilder routes) {
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
			.Produces500ApiResponse();

		group.MapGet(
			PathUtils.GetLastSegment(RoutePath.Staff.Tenants.GetById),
			GetTenantAsStaff.HandleGetTenantAsStaff
		)
			.WithName("GetTenantById")
			.WithSummary("Get a tenant by id")
			.WithPermission([PermissionEnum.Staff.CAN_GET_TENANT])
			.Produces500ApiResponse();

		group.MapPost(
			PathUtils.GetLastSegment(RoutePath.Staff.Tenants.Find),
			FindTenantsAsStaff.HandleFindTenantsAsStaff
		)
			.WithName("FindTenants")
			.WithSummary("Find tenants with pagination")
			.WithReqQueryValidation<FindTenantsAsStaffQuery>()
			.WithPermission([PermissionEnum.Staff.CAN_GET_TENANT])
			.Produces500ApiResponse();

		return group;
	}
}
