using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.SystemNotices.Handlers.Anonymous;

namespace PublyApp.Api.Modules.SystemNotices.Endpoints;

public static class SystemNoticeEndpointsAnonymous {
	public static IEndpointRouteBuilder MapSystemNoticeEndpointsAnonymous(
		this IEndpointRouteBuilder app
	) {
		var group = app.MapGroup(PathUtils.GetLastSegment(Routes.SystemNotices.Anonymous.Root))
			.RequireRateLimiting(
				ApiRateLimitPolicies.AnonymousOther
			)
			.ProducesAppProblem(
				StatusCodes.Status429TooManyRequests
			)
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
