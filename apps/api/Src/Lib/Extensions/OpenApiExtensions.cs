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
					ScalarTarget.JavaScript,
					ScalarTarget.CSharp,
				];
				options.EnabledClients = [
					// shell
					ScalarClient.Curl,
					// javascript
					ScalarClient.Axios,
					ScalarClient.Fetch,
					// csharp
					ScalarClient.HttpClient,
				];
			});
		}

		return app;
	}

	/// <summary>
	/// Adds one or more RFC 7807 ProblemDetails responses to the OpenAPI documentation.
	/// Use this to document error responses from filters (e.g., auth filters).
	/// Handler return types that include AppForbiddenHttpResult, AppNotFoundHttpResult, etc. are auto-documented.
	/// Usage: builder.ProducesAppProblem(StatusCodes.Status401Unauthorized, StatusCodes.Status500InternalServerError);
	/// </summary>
	public static RouteHandlerBuilder ProducesAppProblem(this RouteHandlerBuilder builder, params int[] statusCodes) {
		if (statusCodes is null || statusCodes.Length == 0) return builder;
		foreach (var statusCode in statusCodes) {
			builder = builder.Produces<AppProblemDetails>(statusCode, "application/problem+json");
		}
		return builder;
	}

	/// <summary>
	/// Adds one or more RFC 7807 ProblemDetails responses to the OpenAPI documentation for route groups.
	/// Use this to document error responses from group-level filters (e.g., auth middleware).
	/// Usage: group.ProducesAppProblem(StatusCodes.Status401Unauthorized, StatusCodes.Status403Forbidden);
	/// </summary>
	public static RouteGroupBuilder ProducesAppProblem(this RouteGroupBuilder builder, params int[] statusCodes) {
		if (statusCodes is null || statusCodes.Length == 0) return builder;
		foreach (var statusCode in statusCodes) {
			builder = builder.WithMetadata(new ProducesAppProblemMetadata(statusCode));
		}
		return builder;
	}

	/// <summary>
	/// Adds ValidationProblemDetails (422) response to the OpenAPI documentation.
	/// Use this for validation filters to document the response with the errors dictionary.
	/// </summary>
	public static RouteHandlerBuilder ProducesValidationProblem(this RouteHandlerBuilder builder) {
		return builder.WithMetadata(new ProducesValidationProblemMetadata());
	}
}
