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

		group.MapPost(
			Routes.Posts.ForTenant.RetryPublication,
			RetryPublicationForTenant.Handle
		)
			.WithName("RetryPublicationForTenant")
			.WithSummary("Retry a failed or paused publication")
			.RequireRateLimiting(ApiRateLimitPolicies.AuthenticatedDefault)
			.WithTenantPermission([
				AppPermissions.Tenant.Posts.PUBLISH,
				AppPermissions.Tenant.SocialAccounts.PUBLISH,
			]);

		group.MapPost(
			Routes.Posts.ForTenant.MarkPublicationPublished,
			MarkPublicationPublishedForTenant.Handle
		)
			.WithName("MarkPublicationPublishedForTenant")
			.WithSummary("Mark a needs-review publication as published")
			.RequireRateLimiting(ApiRateLimitPolicies.AuthenticatedDefault)
			.WithTenantPermission([
				AppPermissions.Tenant.Posts.PUBLISH,
				AppPermissions.Tenant.SocialAccounts.PUBLISH,
			]);

		group.MapGet(
			Routes.Posts.ForTenant.PublicationRendition,
			GetPublicationRenditionForTenant.Handle
		)
			.WithName("GetPublicationRenditionForTenant")
			.WithSummary("Get a publication's content overrides and effective content")
			.RequireRateLimiting(ApiRateLimitPolicies.AuthenticatedDefault)
			.WithTenantPermission([AppPermissions.Tenant.Posts.VIEW]);

		group.MapPut(
			Routes.Posts.ForTenant.PublicationRendition,
			SetPublicationRenditionForTenant.Handle
		)
			.WithName("SetPublicationRenditionForTenant")
			.WithSummary("Set a publication's per-destination content overrides")
			.WithReqBodyValidation<SetPublicationRenditionBody>()
			.RequireRateLimiting(ApiRateLimitPolicies.AuthenticatedDefault)
			.WithTenantPermission([AppPermissions.Tenant.Posts.PUBLISH]);

		group.MapDelete(
			Routes.Posts.ForTenant.PublicationRendition,
			ResetPublicationRenditionForTenant.Handle
		)
			.WithName("ResetPublicationRenditionForTenant")
			.WithSummary("Reset a publication to the shared post content")
			.RequireRateLimiting(ApiRateLimitPolicies.AuthenticatedDefault)
			.WithTenantPermission([AppPermissions.Tenant.Posts.PUBLISH]);

		return routes;
	}
}
