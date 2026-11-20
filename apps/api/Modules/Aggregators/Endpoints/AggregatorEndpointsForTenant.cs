using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.Aggregators.Handlers.Tenant;

namespace PublyApp.Api.Modules.Aggregators.Endpoints;

public static class AggregatorEndpointsForTenant {
	public static IEndpointRouteBuilder MapAggregatorEndpointsForTenant(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(Routes.Aggregators.ForTenant.Root)
			.RequireRateLimiting(ApiRateLimitPolicies.AuthenticatedDefault)
			.WithTags("Aggregators");

		group.MapGet(Routes.Aggregators.ForTenant.Find, FindAggregatorsForTenant.Handle)
			.WithName("FindAggregatorsForTenant")
			.WithSummary("List the aggregators the organisation can connect, with its key status")
			.WithTenantPermission([AppPermissions.Tenant.SocialAccounts.VIEW]);

		group.MapPut(Routes.Aggregators.ForTenant.Connection, SaveAggregatorConnectionForTenant.Handle)
			.WithName("SaveAggregatorConnectionForTenant")
			.RequireRateLimiting(ApiRateLimitPolicies.SocialConnect)
			.WithSummary("Check, then save or rotate the organisation's key for an aggregator")
			.WithReqBodyValidation<SaveAggregatorConnectionBody>()
			.WithTenantPermission([AppPermissions.Tenant.SocialAccounts.MANAGE]);

		group.MapPost(Routes.Aggregators.ForTenant.TestConnection, TestAggregatorConnectionForTenant.Handle)
			.WithName("TestAggregatorConnectionForTenant")
			.RequireRateLimiting(ApiRateLimitPolicies.SocialConnect)
			.WithSummary("Re-check the saved key with the aggregator")
			.WithTenantPermission([AppPermissions.Tenant.SocialAccounts.MANAGE]);

		group.MapDelete(Routes.Aggregators.ForTenant.Connection, DeleteAggregatorConnectionForTenant.Handle)
			.WithName("DeleteAggregatorConnectionForTenant")
			.WithSummary("Remove the saved key and erase it")
			.WithTenantPermission([AppPermissions.Tenant.SocialAccounts.MANAGE]);

		return routes;
	}
}
