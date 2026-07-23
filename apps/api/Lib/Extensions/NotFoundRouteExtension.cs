using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Localization;

namespace PublyApp.Api.Lib.Extensions;

public static class NotFoundRouteExtension {
	public static IEndpointRouteBuilder MapNotFoundRoute(this IEndpointRouteBuilder app) {
		app.MapFallback(() =>
			TypedProblems.NotFound(
				"Route not found",
				ResponseKeys.NotFound
			)
		).WithGlobalRateLimitOnly();
		return app;
	}
}
