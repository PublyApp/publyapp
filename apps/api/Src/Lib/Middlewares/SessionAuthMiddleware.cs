using MainApi.Localization;
using MainApi.Src.Data.DbContext;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Lib.Middlewares;

public class SessionAuthMiddleware {
	private readonly ILogger<SessionAuthMiddleware> _logger;
	private readonly RequestDelegate _next;

	public SessionAuthMiddleware(RequestDelegate next, ILogger<SessionAuthMiddleware> logger) {
		_logger = logger;
		_next = next;
	}

	public async Task InvokeAsync(HttpContext context, MainApiDbContext dbContext, IAuthContext authContext) {
		var sessionToken = CheckSessionHeaderMiddleware.GetSessionToken(context);

		if (string.IsNullOrEmpty(sessionToken)) {
			_logger.LogDebug("Session token is missing in request");
			context.Response.StatusCode = StatusCodes.Status401Unauthorized;
			await context.Response.WriteAsJsonAsync(
				ApiResponse.Create("Unauthorized", ResponseKeys.Unauthorized)
			);
			return;
		}

		var session = await dbContext.Session
				.FirstOrDefaultAsync(s => s.Token == sessionToken && s.ExpiresAt > DateTime.UtcNow);

		if (session is null) {
			_logger.LogDebug("Session token is invalid or expired: {@SessionData}", new { sessionToken });
			context.Response.StatusCode = StatusCodes.Status401Unauthorized;
			await context.Response.WriteAsJsonAsync(
				ApiResponse.Create("Unauthorized", ResponseKeys.Unauthorized)
			);
			return;
		}

		// Attach userId for downstream handlers
		authContext.SessionToken = sessionToken;
		authContext.UserId = session.UserId;

		if (!authContext.IsAuthenticated) {
			_logger.LogError("Failed to authenticate user, session has no user attached to it: {@SessionData}", new { sessionToken, userId = session.UserId });
			context.Response.StatusCode = StatusCodes.Status500InternalServerError;
			await context.Response.WriteAsJsonAsync(ApiResponse.Create(
				"Failed to authenticate user",
				ResponseKeys.FailedToAuthenticateUser
			));
			return;
		}

		await _next(context);
	}
}

// Extension method
public static class SessionAuthMiddlewareExtensions {
	private static bool ShouldUseSessionAuthentication(HttpContext context) {
		return context.Request.Path.StartsWithSegments("/staff")
			|| context.Request.Path.StartsWithSegments("/tenant")
			|| context.Request.Path.StartsWithSegments("/auth/user-auth-data");
	}

	private static void ConfigureSessionAuthentication(IApplicationBuilder builder) {
		builder.UseMiddleware<SessionAuthMiddleware>();
	}

	public static IApplicationBuilder UseSessionAuthentication(this IApplicationBuilder app) {
		app.UseWhen(ShouldUseSessionAuthentication, ConfigureSessionAuthentication);
		return app;
	}
}
