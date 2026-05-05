using MainApi.Src.Lib;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Modules.SystemNotices.Handlers.Staff;

namespace MainApi.Src.Modules.SystemNotices.Endpoints;

public static class SystemNoticeEndpointsForStaff {
	public static IEndpointRouteBuilder MapSystemNoticeEndpointsForStaff(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(Routes.SystemNotices.ForStaff.Root)
			.WithTags("Staff System Notices");

		group.MapPost(
				Routes.SystemNotices.ForStaff.Create,
				CreateSystemNotice.HandleCreateSystemNotice
			)
			.WithName("CreateSystemNotice")
			.WithSummary("Create a new system notice")
			.WithReqBodyValidation<CreateSystemNoticeBody>()
			.WithPermission([AppPermissions.Staff.SystemNotices.CREATE]);

		group.MapGet(
				Routes.SystemNotices.ForStaff.Find,
				FindSystemNotices.HandleFindSystemNotices
			)
			.WithName("FindSystemNotices")
			.WithSummary("List all system notices with pagination")
			.WithReqQueryValidation<FindSystemNoticesQuery>()
			.WithPermission([AppPermissions.Staff.SystemNotices.LIST]);

		group.MapGet(
				Routes.SystemNotices.ForStaff.GetById,
				GetSystemNoticeById.HandleGetSystemNoticeById
			)
			.WithName("GetSystemNoticeById")
			.WithSummary("Get a system notice by ID")
			.WithPermission([AppPermissions.Staff.SystemNotices.GET]);

		group.MapPatch(
				Routes.SystemNotices.ForStaff.Update,
				UpdateSystemNotice.HandleUpdateSystemNotice
			)
			.WithName("UpdateSystemNotice")
			.WithSummary("Update an existing system notice")
			.WithReqBodyValidation<UpdateSystemNoticeBody>()
			.WithPermission([AppPermissions.Staff.SystemNotices.UPDATE]);

		group.MapDelete(
				Routes.SystemNotices.ForStaff.Delete,
				DeleteSystemNotice.HandleDeleteSystemNotice
			)
			.WithName("DeleteSystemNotice")
			.WithSummary("Delete a system notice (soft delete)")
			.WithPermission([AppPermissions.Staff.SystemNotices.DELETE]);

		return routes;
	}
}
