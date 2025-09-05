using MainApi.Src.Features.Staff.Tenant.Handlers.CreateTenantStaff;
using MainApi.Src.Lib.Filters;

namespace MainApi.Src.Features.Staff.Tenant;

public static class TenantStaffEndpoints
{
	public static IEndpointRouteBuilder MapTenantStaffEndpoints(this IEndpointRouteBuilder routes)
	{
		var group = routes.MapGroup("/tenants")
			.WithTags("Tenants")
			.WithOpenApi();

		group.MapPost("/", CreateTenantStaff.HandleCreateTenantStaff)
			.WithName("CreateTenant")
			.WithSummary("Create a new tenant")
			.WithBodyValidation<CreateTenantStaffBody>()
			.WithStaffPermission([StaffPermissionEnum.CAN_CREATE_TENANT]);

		return group;
	}
}
