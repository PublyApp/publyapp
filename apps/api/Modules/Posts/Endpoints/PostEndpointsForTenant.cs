using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.Posts.Handlers.Tenant;
using PublyApp.Api.Modules.Publishing.Handlers.Tenant;
using PublyApp.Api.Modules.Uploads;

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

		group.MapPost(
			Routes.Posts.ForTenant.PublishNow,
			PublishNowForTenant.Handle
		)
			.WithName("PublishNowForTenant")
			.RequireRateLimiting(ApiRateLimitPolicies.AuthenticatedDefault)
			// Round-2 item 4: the publishing-endpoint guard walks every handler in
			// the Publishing namespace, wherever its route is mapped — this mapping
			// lives in Modules/Posts but IS a publishing surface. The explicit
			// policy keeps the contract readable at the mapping site (same
			// behaviour as before: this equals the group default).
			.WithSummary("Publish a post now through the chosen connected accounts")
			.WithReqBodyValidation<PublishNowBody>()
			.WithTenantPermission([
				AppPermissions.Tenant.Posts.PUBLISH,
				AppPermissions.Tenant.SocialAccounts.PUBLISH,
			]);

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

		group.MapPost(
				Routes.Posts.ForTenant.AttachImage,
				AttachPostImageForTenant.Handle
			)
			.WithName("AttachPostImageForTenant")
			.RequireRateLimiting(
				ApiRateLimitPolicies.Upload
			)
			.WithSummary("Attach one image to a post (multipart 'file' field)")
			// The handler returns IResult because it has 7 distinct statuses
			// (201/400/422/404/413/429/409), exceeding Results<>'s 6-member cap.
			// Swashbuckle only infers the generic problem responses (400/401/403/
			// 429/500) from IResult, so the post-owned statuses below are
			// documented explicitly for the OpenAPI contract.
			.Produces<PostImageAttached>(StatusCodes.Status201Created)
			.Produces<AppProblemDetails>(StatusCodes.Status404NotFound)
			.Produces<AppProblemDetails>(StatusCodes.Status413PayloadTooLarge)
			.Produces<AppProblemDetails>(StatusCodes.Status422UnprocessableEntity)
			.Produces<AppProblemDetails>(StatusCodes.Status409Conflict)
			.DisableAntiforgery()
			// Rejects oversize bodies at the transport level (413) before the
			// multipart body is spooled, mirroring CreateStaffUpload: the
			// handler's own UPLOAD_MAX_BYTES check stays authoritative.
			.WithMetadata(
				new RequestSizeLimitAttribute(
					AppEnvironment.Instance.UPLOAD_MAX_BYTES
					+ UploadLimits.MultipartHeaderHeadroomBytes
				)
			)
			.WithTenantPermission([AppPermissions.Tenant.Posts.CREATE]);

		group.MapDelete(
			Routes.Posts.ForTenant.AttachImage,
			RemovePostImageForTenant.Handle
		)
			.WithName("RemovePostImageForTenant")
			.WithSummary("Remove a post's attached image")
			.WithTenantPermission([AppPermissions.Tenant.Posts.EDIT]);

		return routes;
	}
}
