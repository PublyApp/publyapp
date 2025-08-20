namespace MainApi.Src.Features.Common.Auth.Middlewares;

public class CheckSessionHeaderMiddleware
{
    private readonly RequestDelegate _next;

		public static string? GetSessionToken(HttpContext context) {
			var token = context.Items["sessionToken"] ?? context.Request.Headers["X-Session-Token"].ToString();

			if (string.IsNullOrEmpty(token as string))
        {
						return null;
        }

			return token as string;
		}

	public CheckSessionHeaderMiddleware(RequestDelegate next)
	{
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var token = GetSessionToken(context);

				if (string.IsNullOrEmpty(token)) {
					context.Response.StatusCode = StatusCodes.Status401Unauthorized;
					await context.Response.WriteAsJsonAsync(new {
						message = "Unauthorized",
						key = "unauthorized",
					});
					return;
				}

        context.Items["sessionToken"] = token;
        await _next(context);
    }
}

// Extension method
public static class CheckSessionHeaderMiddlewareExtensions
{
    private static bool ShouldUseSessionHeaderCheck(HttpContext context)
    {
        return context.Request.Path.StartsWithSegments("/staff")
            || context.Request.Path.StartsWithSegments("/tenant");
    }

    private static void ConfigureSessionHeaderCheck(IApplicationBuilder builder)
    {
        builder.UseMiddleware<CheckSessionHeaderMiddleware>();
    }

    public static WebApplication UseCheckSessionHeader(this WebApplication app)
    {
        app.UseWhen(ShouldUseSessionHeaderCheck, ConfigureSessionHeaderCheck);
        return app;
    }
}
