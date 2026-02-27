using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.SystemNotices.Handlers.Anonymous;

namespace MainApi.Src.Modules.SystemNotices.Endpoints;

public static class SystemNoticeEndpointsAnonymous {
	public static IEndpointRouteBuilder MapSystemNoticeEndpointsAnonymous(
		this IEndpointRouteBuilder app
	) {
		var group = app.MapGroup(PathUtils.GetLastSegment(Routes.SystemNotices.Anonymous.Root))
			.WithTags("System Notices (Public)");

		group.MapGet(
				PathUtils.GetLastSegment(Routes.SystemNotices.Anonymous.GetActive),
				GetActiveSystemNotices.HandleGetActiveSystemNotices
			)
			.WithName("GetActiveSystemNotices")
			.WithSummary("Get all currently active system notices")
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		return app;
	}
}
