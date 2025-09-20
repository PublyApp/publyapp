using MainApi.Src.Features.Staff.Tenant.Handlers.CreateStaffTenant;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Utils;

namespace MainApi.Src.Features.Staff.Tenant;

public static class StaffTenantEndpoints {
	public static IEndpointRouteBuilder MapStaffTenantEndpoints(this IEndpointRouteBuilder routes) {
		var group = routes.MapGroup(PathUtils.GetLastSegment(RoutePath.Staff.Tenants.Root))
			.WithTags("Tenants")
			.WithOpenApi();

		group.MapPost(
			PathUtils.GetLastSegment(RoutePath.Staff.Tenants.Create),
			CreateStaffTenant.HandleCreateStaffTenant
		)
			.WithName("CreateTenant")
			.WithSummary("Create a new tenant")
			.WithBodyValidation<CreateStaffTenantBody>()
			.WithPermission([PermissionEnum.Staff.CAN_CREATE_TENANT]);

		return group;
	}
}
