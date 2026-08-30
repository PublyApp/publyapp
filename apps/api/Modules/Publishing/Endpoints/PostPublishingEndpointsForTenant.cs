using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.Publishing.Handlers.Tenant;

namespace PublyApp.Api.Modules.Publishing.Endpoints;

/// <summary>
/// Maps the D3 schedule surfaces that hang off the posts resource:
/// <list type="bullet">
///   <item>POST/PATCH/DELETE <c>/posts/{postId}/schedule</c> for the
///   per-post schedule lifecycle (create, edit, cancel);</item>
///   <item>GET <c>/posts/publications</c> for the keyset queue/calendar
///   list of scheduled publications.</item>
/// </list>
/// The route is <c>/posts/*</c> because every action here is a property
/// of a post, not of a separate publishing resource. Separating these
/// from the D2 history + composer targets at <c>/publishing/*</c> also
/// removes the route ambiguity that
/// <c>FindPublications</c> + <c>FindScheduledPublications</c> shared
/// when both were mounted under the same group root.
/// </summary>
public static class PostPublishingEndpointsForTenant {
	public static IEndpointRouteBuilder MapPostPublishingEndpointsForTenant(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(Routes.Posts.ForTenant.Root)
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithTags("Publishing");

		group.MapPost(
			"/{postId}/schedule",
			SchedulePostForTenant.Handle
		)
			.WithName("SchedulePostForTenant")
			.WithSummary("Schedule a post for future publication")
			.WithReqBodyValidation<SchedulePostBody>()
			.RequireRateLimiting(ApiRateLimitPolicies.AuthenticatedDefault)
			.WithTenantPermission([AppPermissions.Tenant.Posts.PUBLISH]);

		group.MapPatch(
			"/{postId}/schedule",
			EditPostScheduleForTenant.Handle
		)
			.WithName("EditPostScheduleForTenant")
			.WithSummary("Edit a scheduled post's text and/or schedule")
			.WithReqBodyValidation<EditPostScheduleBody>()
			.RequireRateLimiting(ApiRateLimitPolicies.AuthenticatedDefault)
			.WithTenantPermission([AppPermissions.Tenant.Posts.PUBLISH]);

		group.MapDelete(
			"/{postId}/schedule",
			CancelPostScheduleForTenant.Handle
		)
			.WithName("CancelPostScheduleForTenant")
			.WithSummary("Cancel a post's schedule (delete Scheduled publications)")
			.RequireRateLimiting(ApiRateLimitPolicies.AuthenticatedDefault)
			.WithTenantPermission([AppPermissions.Tenant.Posts.PUBLISH]);

		group.MapGet(
			"/publications",
			FindScheduledPublicationsForTenant.Handle
		)
			.WithName("FindScheduledPublicationsForTenant")
			.RequireRateLimiting(ApiRateLimitPolicies.HeavySearchList)
			.WithSummary("Find scheduled publications (queue + calendar)")
			.WithReqQueryValidation<FindScheduledPublicationsQuery>()
			.WithTenantPermission([AppPermissions.Tenant.Posts.VIEW]);

		return routes;
	}
}
