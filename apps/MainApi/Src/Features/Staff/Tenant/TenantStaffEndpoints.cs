namespace MainApi.Src.Features.Staff.Tenant;

public static class TenantStaffEndpoints
{
	public static IEndpointRouteBuilder MapTenantStaffEndpoints(this IEndpointRouteBuilder routes)
	{
		var group = routes.MapGroup("/tenants")
			.WithTags("Tenants")
			.WithOpenApi();

		group.MapPost("/", TenantStaffHandlers.CreateTenant)
			.WithName("CreateTenant")
			.WithSummary("Create a new tenant");

		return group;
	}
}
