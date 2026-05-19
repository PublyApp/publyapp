using MainApi.Localization;
using MainApi.Lib.ProblemResults;

namespace MainApi.Lib.Extensions;

public static class NotFoundRouteExtension {
	public static IEndpointRouteBuilder MapNotFoundRoute(this IEndpointRouteBuilder app) {
		app.MapFallback(() => TypedProblems.NotFound("Route not found", ResponseKeys.NotFound));
		return app;
	}
}
