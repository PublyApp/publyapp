using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.Posts.Handlers.Tenant;

namespace PublyApp.Api.Modules.Posts.Endpoints;

public static class PostEndpointsForTenant {
	public static IEndpointRouteBuilder MapPostEndpointsForTenant(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(Routes.Posts.ForTenant.Root)
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithTags("Posts");

		group.MapPost(
			Routes.Posts.ForTenant.Create,
			CreatePostForTenant.Handle
		)
			.WithName("CreatePostForTenant")
			.WithSummary("Create a post for the current tenant")
			.WithReqBodyValidation<CreatePostBody>()
			.WithTenantPermission([AppPermissions.Tenant.Posts.CREATE]);

		group.MapGet(
			Routes.Posts.ForTenant.Find,
			FindPostsForTenant.Handle
		)
			.WithName("FindPostsForTenant")
			.RequireRateLimiting(
				ApiRateLimitPolicies.HeavySearchList
			)
			.WithSummary("Find posts for the current tenant")
			.WithReqQueryValidation<FindPostsForTenantQuery>()
			.WithTenantPermission([AppPermissions.Tenant.Posts.VIEW]);

		group.MapGet(
			Routes.Posts.ForTenant.GetById,
			GetPostForTenant.Handle
		)
			.WithName("GetPostForTenant")
			.WithSummary("Get a post by id for the current tenant")
			.WithTenantPermission([AppPermissions.Tenant.Posts.VIEW]);

		group.MapPatch(
			Routes.Posts.ForTenant.Update,
			UpdatePostForTenant.Handle
		)
			.WithName("UpdatePostForTenant")
			.WithSummary("Update a post for the current tenant")
			.WithReqBodyValidation<UpdatePostBody>()
			.WithTenantPermission([AppPermissions.Tenant.Posts.EDIT]);

		group.MapDelete(
			Routes.Posts.ForTenant.Delete,
			DeletePostForTenant.Handle
		)
			.WithName("DeletePostForTenant")
			.WithSummary("Delete a post for the current tenant")
			.WithTenantPermission([AppPermissions.Tenant.Posts.DELETE]);

		return routes;
	}
}
