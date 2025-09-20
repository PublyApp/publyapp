using MainApi.Localization;

namespace MainApi.Src.Lib.Extensions;

public static class NotFoundRouteExtension {
	public static IEndpointRouteBuilder MapNotFoundRoute(this IEndpointRouteBuilder app) {
		app.MapFallback(() => {
			return Results.NotFound(
				ApiResponse.Create(
					"Route not found",
					ResponseKeys.NotFound
				)
			);
		});

		return app;
	}
}
