namespace MainApi.Src.Features.Common.Auth.Middlewares;

public class CheckTenantHeaderMiddleware
{
    private readonly RequestDelegate _next;

		public static string? GetTenantId(HttpContext context) {
			var tenantId = context.Items["tenantId"] ?? context.Request.Headers["X-Tenant-Id"].ToString();

			if (string.IsNullOrEmpty(tenantId as string))
        {

						return null;
        }

			return tenantId as string;
		}

	public CheckTenantHeaderMiddleware(RequestDelegate next)
	{
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var tenantId = GetTenantId(context);

				if (string.IsNullOrEmpty(tenantId)) {
					context.Response.StatusCode = StatusCodes.Status401Unauthorized;
					await context.Response.WriteAsJsonAsync(new {
						message = "Unauthorized",
						key = "unauthorized",
					});
					return;
				}

        context.Items["tenantId"] = tenantId;

        await _next(context);
    }
}

// Extension method
public static class CheckTenantHeaderMiddlewareExtensions
{
    private static bool ShouldUseTenantHeaderCheck(HttpContext context)
    {
        return context.Request.Path.StartsWithSegments("/tenant");
    }

    private static void ConfigureTenantHeaderCheck(IApplicationBuilder builder)
    {
        builder.UseMiddleware<CheckTenantHeaderMiddleware>();
    }

    public static WebApplication UseCheckTenantHeader(this WebApplication app)
    {
        app.UseWhen(ShouldUseTenantHeaderCheck, ConfigureTenantHeaderCheck);
        return app;
    }
}
