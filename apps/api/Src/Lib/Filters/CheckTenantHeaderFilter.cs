using MainApi.Localization;

namespace MainApi.Src.Lib.Filters;

/// <summary>
/// Validates that the X-Tenant-Id header is present in the request.
/// Sets the tenant ID in TenantContext if present.
/// </summary>
public class CheckTenantHeaderFilter : IEndpointFilter {
	public async ValueTask<object?> InvokeAsync(
		EndpointFilterInvocationContext context,
		EndpointFilterDelegate next
	) {
		var httpContext = context.HttpContext;
		var tenantContext = httpContext.RequestServices.GetRequiredService<ITenantContext>();

		// Try to get tenant ID from TenantContext first, then from header
		var tenantId = tenantContext.TenantId
			?? httpContext.Request.Headers["X-Tenant-Id"].FirstOrDefault();

		if (string.IsNullOrEmpty(tenantId)) {
			httpContext.Response.StatusCode = StatusCodes.Status401Unauthorized;
			return TypedResults.Json(
				ApiResponse.Create("Unauthorized", ResponseKeys.Unauthorized),
				statusCode: StatusCodes.Status401Unauthorized
			);
		}

		// Set tenant ID in TenantContext for downstream filters/handlers
		tenantContext.TenantId = tenantId;

		return await next(context);
	}
}

/// <summary>
/// Extension methods for applying CheckTenantHeaderFilter to route groups and individual routes.
/// </summary>
public static class CheckTenantHeaderFilterExtensions {
	/// <summary>
	/// Adds CheckTenantHeaderFilter to the route group.
	/// Validates that X-Tenant-Id header is present.
	/// </summary>
	public static RouteGroupBuilder WithCheckTenantHeader(this RouteGroupBuilder builder) {
		return builder.AddEndpointFilter<CheckTenantHeaderFilter>();
	}

	/// <summary>
	/// Adds CheckTenantHeaderFilter to the route handler.
	/// Validates that X-Tenant-Id header is present.
	/// </summary>
	public static RouteHandlerBuilder WithCheckTenantHeader(this RouteHandlerBuilder builder) {
		return builder.AddEndpointFilter<CheckTenantHeaderFilter>();
	}
}
