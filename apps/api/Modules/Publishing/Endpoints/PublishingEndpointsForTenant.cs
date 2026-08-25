using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.Publishing.Handlers.Tenant;

namespace PublyApp.Api.Modules.Publishing.Endpoints;

public static class PublishingEndpointsForTenant {
	public static IEndpointRouteBuilder MapPublishingEndpointsForTenant(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(Routes.Publishing.ForTenant.Root)
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithTags("Publishing");

		group.MapGet(
			Routes.Publishing.ForTenant.FindPublications,
			FindPublicationsForTenant.Handle
		)
			.WithName("FindPublicationsForTenant")
			.RequireRateLimiting(
				ApiRateLimitPolicies.HeavySearchList
			)
			.WithSummary("Find publications for the current tenant")
			.WithReqQueryValidation<FindPublicationsQuery>()
			.WithTenantPermission([AppPermissions.Tenant.Posts.VIEW]);

		group.MapGet(
			Routes.Publishing.ForTenant.PublishTargets,
			GetPublishTargetsForTenant.Handle
		)
			.WithName("GetPublishTargetsForTenant")
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithSummary("List visible social accounts as composer publish targets")
			.WithTenantPermission([AppPermissions.Tenant.SocialAccounts.PUBLISH]);

		group.MapPost(
			Routes.Publishing.ForTenant.Schedule,
			SchedulePostForTenant.Handle
		)
			.WithName("SchedulePostForTenant")
			.WithSummary("Schedule a post for future publication")
			.WithReqBodyValidation<SchedulePostBody>()
			.WithTenantPermission([AppPermissions.Tenant.Posts.PUBLISH]);

		return routes;
	}
}
