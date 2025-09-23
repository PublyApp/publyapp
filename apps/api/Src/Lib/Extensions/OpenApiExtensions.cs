using Scalar.AspNetCore;

namespace MainApi.Src.Lib.Extensions;

public static class OpenApiExtensions {
	/// <summary>
	/// Configures OpenAPI documentation for development environment
	/// </summary>
	/// <param name="app">The web application</param>
	/// <returns>The web application for method chaining</returns>
	public static WebApplication UseOpenApi(this WebApplication app) {
		if (app.Environment.IsDevelopment()) {
			// /openapi/{documentName}.json
			app.MapOpenApi();
			app.MapScalarApiReference(options => {
				options.EnabledTargets = [
					ScalarTarget.Shell,
					ScalarTarget.Node,
					ScalarTarget.JavaScript,
					ScalarTarget.CSharp,
				];
				options.EnabledClients = [
					ScalarClient.Curl,
					ScalarClient.Wget,
					ScalarClient.Axios,
					ScalarClient.HttpClient,
					ScalarClient.Request,
					ScalarClient.RestSharp,
				];
			});
		}

		return app;
	}

	/// <summary>
	/// Adds a 500 Internal Server Error response to the OpenAPI documentation
	/// (works with build-time OpenAPI generation)
	/// </summary>
	public static RouteHandlerBuilder Produces500ApiResponse(this RouteHandlerBuilder builder) {
		return builder.Produces<ApiResponse>(StatusCodes.Status500InternalServerError, "application/json");
	}
}

