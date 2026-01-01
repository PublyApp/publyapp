using MainApi.Localization;

namespace MainApi.Src.Lib.Middlewares;

public class CheckTenantHeaderMiddleware {
	private readonly RequestDelegate _next;

	public static string? GetTenantId(HttpContext httpContext) {
		var tenantId = httpContext.RequestServices.GetRequiredService<IRequestAuthContext>().TenantId
			?? httpContext.Request.Headers["X-Tenant-Id"].FirstOrDefault();

		if (string.IsNullOrEmpty(tenantId as string)) {

			return null;
		}

		return tenantId as string;
	}

	public CheckTenantHeaderMiddleware(RequestDelegate next) {
		_next = next;
	}

	public async Task InvokeAsync(HttpContext httpContext, IRequestAuthContext authContext) {
		var tenantId = GetTenantId(httpContext);

		if (string.IsNullOrEmpty(tenantId)) {
			httpContext.Response.StatusCode = StatusCodes.Status401Unauthorized;
			await httpContext.Response.WriteAsJsonAsync(
				ApiResponse.Create("Unauthorized", ResponseKeys.Unauthorized)
			);
			return;
		}

		authContext.TenantId = tenantId;

		await _next(httpContext);
	}
}

// Extension method
public static class CheckTenantHeaderMiddlewareExtensions {
	private static bool ShouldUseTenantHeaderCheck(HttpContext context) {
		return context.Request.Path.StartsWithSegments(RoutePath.Tenant.Root);
	}

	private static void ConfigureTenantHeaderCheck(IApplicationBuilder builder) {
		builder.UseMiddleware<CheckTenantHeaderMiddleware>();
	}

	public static IApplicationBuilder UseCheckTenantHeader(this IApplicationBuilder app) {
		app.UseWhen(ShouldUseTenantHeaderCheck, ConfigureTenantHeaderCheck);
		return app;
	}
}
