using MainApi.Src.Features.Staff.Tenant.Handlers.CreateStaffTenant;
using MainApi.Src.Lib.Filters;

namespace MainApi.Src.Features.Staff.Tenant;

public static class StaffTenantEndpoints {
	public static IEndpointRouteBuilder MapStaffTenantEndpoints(this IEndpointRouteBuilder routes) {
		var group = routes.MapGroup("/tenants")
			.WithTags("Tenants")
			.WithOpenApi();

		group.MapPost("/", CreateStaffTenant.HandleCreateStaffTenant)
			.WithName("CreateTenant")
			.WithSummary("Create a new tenant")
			.WithBodyValidation<CreateStaffTenantBody>()
			.WithPermission([PermissionEnum.Staff.CAN_CREATE_TENANT]);

		return group;
	}
}
