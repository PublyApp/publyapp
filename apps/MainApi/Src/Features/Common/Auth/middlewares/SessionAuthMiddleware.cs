namespace MainApi.Src.Features.Common.Auth.Middlewares;

using MainApi.Src.Data.DbContext;

public class SessionAuthMiddleware
{
    private readonly RequestDelegate _next;

	public SessionAuthMiddleware(RequestDelegate next)
	{
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, MainApiDbContext dbContext)
    {
        var token = CheckSessionHeaderMiddleware.GetSessionToken(context);

				if (string.IsNullOrEmpty(token)) {
					context.Response.StatusCode = StatusCodes.Status401Unauthorized;
					await context.Response.WriteAsJsonAsync(new {
						message = "Unauthorized",
						key = "unauthorized",
					});
					return;
				}

        // var session = await db.Session
        //     .FirstOrDefaultAsync(s => s.Token == token && s.ExpiresAt > DateTime.UtcNow);
				var cond = token == "123";

        if (/* session is null */!cond)
        {
					context.Response.StatusCode = StatusCodes.Status401Unauthorized;
					await context.Response.WriteAsJsonAsync(new {
						message = "Unauthorized",
						key = "unauthorized",
					});
					return;
        }

        // Attach userId for downstream handlers
        context.Items["UserId"] = "123"; //session.UserId;
        await _next(context);
    }
}

// Extension method
public static class SessionAuthMiddlewareExtensions
{
		private static bool ShouldUseSessionAuthentication(HttpContext context)
		{
			return context.Request.Path.StartsWithSegments("/staff")
				|| context.Request.Path.StartsWithSegments("/tenant");
		}

		private static void ConfigureSessionAuthentication(IApplicationBuilder builder)
		{
			builder.UseMiddleware<SessionAuthMiddleware>();
		}

    public static WebApplication UseSessionAuthentication(this WebApplication app)
    {
        app.UseWhen(ShouldUseSessionAuthentication, ConfigureSessionAuthentication);
        return app;
    }
}
