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
		var authContext = httpContext.RequestServices.GetRequiredService<IRequestAuthContext>();

		// Try to get tenant ID from AuthContext first, then from header
		var tenantId = authContext.TenantId
			?? httpContext.Request.Headers["X-Tenant-Id"].FirstOrDefault();

		if (string.IsNullOrEmpty(tenantId)) {
			return TypedResults.Json(
				ApiResponse.Create("Unauthorized", ResponseKeys.Unauthorized),
				statusCode: StatusCodes.Status401Unauthorized
			);
		}

		// Set tenant ID in AuthContext for downstream filters/handlers
		authContext.TenantId = tenantId;

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
