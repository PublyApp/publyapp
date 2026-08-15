using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.Settings.Handlers.Tenant;

namespace PublyApp.Api.Modules.Settings.Endpoints;

public static class SettingsEndpointsForTenant {
	public static IEndpointRouteBuilder MapSettingsEndpointsForTenant(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(Routes.Settings.ForTenant.Root)
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithTags("Settings");

		group.MapGet(
			Routes.Settings.ForTenant.General,
			GetTenantSettingsForTenant.Handle
		)
			.WithName("GetTenantSettingsForTenant")
			.WithSummary("Get the tenant's general settings")
			.WithTenantPermission([AppPermissions.Tenant.Settings.VIEW]);

		group.MapPatch(
			Routes.Settings.ForTenant.UpdateGeneral,
			UpdateTenantSettingsForTenant.Handle
		)
			.WithName("UpdateTenantSettingsForTenant")
			.WithSummary("Update the tenant's general settings")
			.WithTenantPermission([AppPermissions.Tenant.Settings.EDIT])
			.WithReqBodyValidation<UpdateTenantSettingsGeneralBody>();

		return routes;
	}
}
