using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.SystemNotices.Handlers.Staff;

namespace PublyApp.Api.Modules.SystemNotices.Endpoints;

public static class SystemNoticeEndpointsForStaff {
	public static IEndpointRouteBuilder MapSystemNoticeEndpointsForStaff(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(Routes.SystemNotices.ForStaff.Root)
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithTags("Staff System Notices");

		group.MapPost(
				Routes.SystemNotices.ForStaff.Create,
				CreateSystemNotice.Handle
			)
			.WithName("CreateSystemNotice")
			.WithSummary("Create a new system notice")
			.WithReqBodyValidation<CreateSystemNoticeBody>()
			.WithPermission([AppPermissions.Staff.SystemNotices.CREATE]);

		group.MapGet(
				Routes.SystemNotices.ForStaff.Find,
				FindSystemNotices.Handle
			)
			.WithName("FindSystemNotices")
			.RequireRateLimiting(
				ApiRateLimitPolicies.HeavySearchList
			)
			.WithSummary("List all system notices with pagination")
			.WithReqQueryValidation<FindSystemNoticesQuery>()
			.WithPermission([AppPermissions.Staff.SystemNotices.LIST]);

		group.MapGet(
				Routes.SystemNotices.ForStaff.GetById,
				GetSystemNoticeById.Handle
			)
			.WithName("GetSystemNoticeById")
			.WithSummary("Get a system notice by ID")
			.WithPermission([AppPermissions.Staff.SystemNotices.GET]);

		group.MapPatch(
				Routes.SystemNotices.ForStaff.Update,
				UpdateSystemNotice.Handle
			)
			.WithName("UpdateSystemNotice")
			.WithSummary("Update an existing system notice")
			.WithReqBodyValidation<UpdateSystemNoticeBody>()
			.WithPermission([AppPermissions.Staff.SystemNotices.UPDATE]);

		group.MapDelete(
				Routes.SystemNotices.ForStaff.Delete,
				DeleteSystemNotice.Handle
			)
			.WithName("DeleteSystemNotice")
			.WithSummary("Delete a system notice (soft delete)")
			.WithPermission([AppPermissions.Staff.SystemNotices.DELETE]);

		return routes;
	}
}
