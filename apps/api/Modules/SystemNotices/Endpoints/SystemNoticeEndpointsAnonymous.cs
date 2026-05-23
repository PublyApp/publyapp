using MainApi.Lib.Extensions;
using MainApi.Lib.Routes;
using MainApi.Lib.Utils;
using MainApi.Modules.SystemNotices.Handlers.Anonymous;

namespace MainApi.Modules.SystemNotices.Endpoints;

public static class SystemNoticeEndpointsAnonymous {
	public static IEndpointRouteBuilder MapSystemNoticeEndpointsAnonymous(
		this IEndpointRouteBuilder app
	) {
		var group = app.MapGroup(PathUtils.GetLastSegment(Routes.SystemNotices.Anonymous.Root))
			.WithTags("System Notices (Public)");

		group.MapGet(
				PathUtils.GetLastSegment(Routes.SystemNotices.Anonymous.GetActive),
				GetActiveSystemNotices.Handle
			)
			.WithName("GetActiveSystemNotices")
			.WithSummary("Get all currently active system notices")
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		return app;
	}
}
