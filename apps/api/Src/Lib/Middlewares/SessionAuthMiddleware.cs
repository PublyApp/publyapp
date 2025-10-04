using MainApi.Localization;
using MainApi.Src.Features.Common.Session;

namespace MainApi.Src.Lib.Middlewares;

public class SessionAuthMiddleware {
	private readonly ILogger<SessionAuthMiddleware> _logger;
	private readonly RequestDelegate _next;

	public SessionAuthMiddleware(RequestDelegate next, ILogger<SessionAuthMiddleware> logger) {
		_logger = logger;
		_next = next;
	}

	public async Task InvokeAsync(
		HttpContext httpContext,
		ISessionService sessionService,
		IAuthContext authContext
	) {
		var sessionToken = CheckSessionHeaderMiddleware.GetSessionToken(httpContext);

		if (string.IsNullOrEmpty(sessionToken)) {
			_logger.LogDebug("Session token is missing in request");
			httpContext.Response.StatusCode = StatusCodes.Status401Unauthorized;
			await httpContext.Response.WriteAsJsonAsync(
				ApiResponse.Create("Unauthorized", ResponseKeys.Unauthorized)
			);
			return;
		}

		var session = await sessionService.GetSessionByToken(sessionToken, httpContext.RequestAborted);

		if (session is null) {
			_logger.LogDebug("Session token is invalid or expired: {@SessionData}", new { sessionToken });
			httpContext.Response.StatusCode = StatusCodes.Status401Unauthorized;
			await httpContext.Response.WriteAsJsonAsync(
				ApiResponse.Create("Unauthorized", ResponseKeys.Unauthorized)
			);
			return;
		}

		// Attach userId for downstream handlers
		authContext.SessionToken = sessionToken;
		authContext.UserId = session.UserId;

		if (!authContext.IsAuthenticated) {
			_logger.LogError("Failed to authenticate user, session has no user attached to it: {@SessionData}", new { sessionToken, userId = session.UserId });
			httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;
			await httpContext.Response.WriteAsJsonAsync(ApiResponse.Create(
				"Failed to authenticate user",
				ResponseKeys.FailedToAuthenticateUser
			));
			return;
		}

		await _next(httpContext);
	}
}

// Extension method
public static class SessionAuthMiddlewareExtensions {
	private static readonly string[] _paths = [
		RoutePath.Staff.Root,
		RoutePath.Tenant.Root,
		RoutePath.Auth.GetUserAuthData,
		RoutePath.Auth.GetRedirectCode
	];

	private static bool ShouldUseSessionAuthentication(HttpContext context) {
		return _paths.Any(path => context.Request.Path.StartsWithSegments(path));
	}

	private static void ConfigureSessionAuthentication(IApplicationBuilder builder) {
		builder.UseMiddleware<SessionAuthMiddleware>();
	}

	public static IApplicationBuilder UseSessionAuthentication(this IApplicationBuilder app) {
		app.UseWhen(ShouldUseSessionAuthentication, ConfigureSessionAuthentication);
		return app;
	}
}
