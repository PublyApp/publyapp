namespace MainApi.Src.Lib.Middlewares;

public class CheckSessionHeaderMiddleware
{
	private readonly RequestDelegate _next;

	public static string? GetSessionToken(HttpContext httpContext)
	{
		var sessionToken = httpContext.RequestServices.GetRequiredService<IAuthContext>().SessionToken
			?? httpContext.Request.Headers["X-Session-Token"].FirstOrDefault();

		if (string.IsNullOrEmpty(sessionToken))
		{
			return null;
		}

		return sessionToken;
	}

	public CheckSessionHeaderMiddleware(RequestDelegate next)
	{
		_next = next;
	}

	public async Task InvokeAsync(HttpContext httpContext, IAuthContext authContext)
	{
		var token = GetSessionToken(httpContext);

		if (string.IsNullOrEmpty(token))
		{
			httpContext.Response.StatusCode = StatusCodes.Status401Unauthorized;
			await httpContext.Response.WriteAsJsonAsync(new
			{
				message = "Unauthorized",
				key = "unauthorized",
			});
			return;
		}

		// var authContext = httpContext.RequestServices.GetRequiredService<IAuthContext>();
		authContext.SessionToken = token;
		await _next(httpContext);
	}
}

// Extension method
public static class CheckSessionHeaderMiddlewareExtensions
{
	private static bool ShouldUseSessionHeaderCheck(HttpContext context)
	{
		return context.Request.Path.StartsWithSegments("/staff")
			|| context.Request.Path.StartsWithSegments("/tenant")
			|| context.Request.Path.StartsWithSegments("/auth/user-auth-data");
	}

	private static void ConfigureSessionHeaderCheck(IApplicationBuilder builder)
	{
		builder.UseMiddleware<CheckSessionHeaderMiddleware>();
	}

	public static IApplicationBuilder UseCheckSessionHeader(this IApplicationBuilder app)
	{
		app.UseWhen(ShouldUseSessionHeaderCheck, ConfigureSessionHeaderCheck);
		return app;
	}
}
