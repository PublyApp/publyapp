using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.Projects.Handlers.Tenant;

namespace PublyApp.Api.Modules.Projects.Endpoints;

public static class ProjectEndpointsForTenant {
	public static IEndpointRouteBuilder MapProjectEndpointsForTenant(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(Routes.Projects.ForTenant.Root)
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithTags("Projects");

		group.MapGet(
			Routes.Projects.ForTenant.Find,
			FindProjectsForTenant.Handle
		)
			.WithName("FindProjectsForTenant")
			.RequireRateLimiting(
				ApiRateLimitPolicies.HeavySearchList
			)
			.WithSummary("List active projects of the current tenant")
			.WithTenantPermission([AppPermissions.Tenant.Projects.VIEW]);

		return routes;
	}
}