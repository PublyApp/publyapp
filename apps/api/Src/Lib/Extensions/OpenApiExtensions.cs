using MainApi.Src.Lib.ProblemResults;

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
	/// Adds one or more API responses to the OpenAPI documentation for the given status codes
	/// (works with build-time OpenAPI generation).
	/// Usage: builder.ProducesApiResponses(StatusCodes.Status401Unauthorized, StatusCodes.Status500InternalServerError);
	/// </summary>
	public static RouteHandlerBuilder ProducesApiResponses(this RouteHandlerBuilder builder, params int[] statusCodes) {
		if (statusCodes is null || statusCodes.Length == 0) return builder;
		foreach (var statusCode in statusCodes) {
			builder = builder.Produces<ApiResponse>(statusCode, "application/json");
		}
		return builder;
	}

	/// <summary>
	/// Adds one or more RFC 7807 ProblemDetails responses to the OpenAPI documentation.
	/// Use this to document error responses from filters (e.g., auth filters).
	/// Handler return types that include ForbiddenHttpResult, NotFoundHttpResult, etc. are auto-documented.
	/// Usage: builder.ProducesAppProblem(StatusCodes.Status401Unauthorized, StatusCodes.Status500InternalServerError);
	/// </summary>
	public static RouteHandlerBuilder ProducesAppProblem(this RouteHandlerBuilder builder, params int[] statusCodes) {
		if (statusCodes is null || statusCodes.Length == 0) return builder;
		foreach (var statusCode in statusCodes) {
			builder = builder.Produces<AppProblemDetails>(statusCode, "application/problem+json");
		}
		return builder;
	}
}
