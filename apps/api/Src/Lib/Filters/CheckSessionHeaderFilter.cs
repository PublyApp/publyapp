using MainApi.Localization;

using Microsoft.Extensions.Options;

namespace MainApi.Src.Lib.Filters;

/// <summary>
/// Validates that the X-Session-Token header is present in the request.
/// Sets the session token in AuthContext if present.
/// </summary>
public class CheckSessionHeaderFilter : IEndpointFilter {
	public async ValueTask<object?> InvokeAsync(
		EndpointFilterInvocationContext context,
		EndpointFilterDelegate next
	) {
		var httpContext = context.HttpContext;
		var authContext = httpContext.RequestServices.GetRequiredService<IRequestAuthContext>();
		var appSettings = httpContext.RequestServices.GetRequiredService<IOptions<AppSettings>>();

		// Try to get token from AuthContext first, then from header
		var sessionToken = authContext.SessionToken
			?? httpContext.Request.Headers[appSettings.Value.SESSION_TOKEN_HEADER_KEY].FirstOrDefault();

		if (string.IsNullOrEmpty(sessionToken)) {
			return TypedResults.Json(
				ApiResponse.Create("Unauthorized", ResponseKeys.Unauthorized),
				statusCode: StatusCodes.Status401Unauthorized
			);
		}

		// Set token in AuthContext for downstream filters/handlers
		authContext.SessionToken = sessionToken;

		return await next(context);
	}
}

/// <summary>
/// Extension methods for applying CheckSessionHeaderFilter to route groups and individual routes.
/// </summary>
public static class CheckSessionHeaderFilterExtensions {
	/// <summary>
	/// Adds CheckSessionHeaderFilter to the route group.
	/// Validates that X-Session-Token header is present.
	/// </summary>
	public static RouteGroupBuilder WithCheckSessionHeader(this RouteGroupBuilder builder) {
		return builder.AddEndpointFilter<CheckSessionHeaderFilter>();
	}

	/// <summary>
	/// Adds CheckSessionHeaderFilter to the route handler.
	/// Validates that X-Session-Token header is present.
	/// </summary>
	public static RouteHandlerBuilder WithCheckSessionHeader(this RouteHandlerBuilder builder) {
		return builder.AddEndpointFilter<CheckSessionHeaderFilter>();
	}
}
