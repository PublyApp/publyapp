using MainApi.Localization;
using MainApi.Src.Modules.Shared.Auth;

using Microsoft.Extensions.Options;

namespace MainApi.Src.Lib.Filters;

/// <summary>
/// Authenticates the user by validating the session token.
/// Requires CheckSessionHeaderFilter to run first.
/// Sets UserId in AuthContext after successful authentication.
/// </summary>
public class SessionAuthFilter : IEndpointFilter {
	private readonly ILogger<SessionAuthFilter> _logger;

	public SessionAuthFilter(ILogger<SessionAuthFilter> logger) {
		_logger = logger;
	}

	public async ValueTask<object?> InvokeAsync(
		EndpointFilterInvocationContext context,
		EndpointFilterDelegate next
	) {
		var httpContext = context.HttpContext;
		var authContext = httpContext.RequestServices.GetRequiredService<IRequestAuthContext>();
		var sessionService = httpContext.RequestServices.GetRequiredService<ISessionService>();
		var appSettings = httpContext.RequestServices.GetRequiredService<IOptions<AppSettings>>();

		// Get session token (should be set by CheckSessionHeaderFilter)
		var sessionToken = authContext.SessionToken
			?? httpContext.Request.Headers[appSettings.Value.SESSION_TOKEN_HEADER_KEY].FirstOrDefault();

		if (string.IsNullOrEmpty(sessionToken)) {
			_logger.LogDebug("Session token is missing in request");
			return TypedResults.Json(
				ApiResponse.Create("Unauthorized", ResponseKeys.Unauthorized),
				statusCode: StatusCodes.Status401Unauthorized
			);
		}

		var sessionData = await sessionService.GetSessionByToken(sessionToken, httpContext.RequestAborted);

		if (sessionData is null) {
			_logger.LogDebug("Session token is invalid or expired");
			return TypedResults.Json(
				ApiResponse.Create("Unauthorized", ResponseKeys.Unauthorized),
				statusCode: StatusCodes.Status401Unauthorized
			);
		}

		// Attach userId for downstream filters/handlers
		authContext.SessionToken = sessionToken;
		authContext.UserId = sessionData.User.Id;

		if (!authContext.IsAuthenticated) {
			_logger.LogError("Failed to authenticate user, session has no user attached");
			return TypedResults.Json(
				ApiResponse.Create("Failed to authenticate user", ResponseKeys.FailedToAuthenticateUser),
				statusCode: StatusCodes.Status500InternalServerError
			);
		}

		return await next(context);
	}
}

/// <summary>
/// Extension methods for applying SessionAuthFilter to route groups and individual routes.
/// </summary>
public static class SessionAuthFilterExtensions {
	/// <summary>
	/// Adds SessionAuthFilter to the route group.
	/// Authenticates the user via session token.
	/// Requires CheckSessionHeaderFilter to be applied first.
	/// </summary>
	public static RouteGroupBuilder WithSessionAuthentication(this RouteGroupBuilder builder) {
		return builder.AddEndpointFilter<SessionAuthFilter>();
	}

	/// <summary>
	/// Adds SessionAuthFilter to the route handler.
	/// Authenticates the user via session token.
	/// Requires CheckSessionHeaderFilter to be applied first.
	/// </summary>
	public static RouteHandlerBuilder WithSessionAuthentication(this RouteHandlerBuilder builder) {
		return builder.AddEndpointFilter<SessionAuthFilter>();
	}
}
