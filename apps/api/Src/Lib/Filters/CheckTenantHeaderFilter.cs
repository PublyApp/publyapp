using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;

using Microsoft.Extensions.Options;

namespace MainApi.Src.Lib.Filters;

/// <summary>
/// Validates that the tenant ID header (configured in AppSettings.TENANT_ID_HEADER_KEY) is present in the request.
/// Sets the tenant ID in TenantContext if present.
/// </summary>
public class CheckTenantHeaderFilter : IEndpointFilter {
	public async ValueTask<object?> InvokeAsync(
		EndpointFilterInvocationContext context,
		EndpointFilterDelegate next
	) {
		var httpContext = context.HttpContext;
		var authContext = httpContext.RequestServices.GetRequiredService<IRequestAuthContext>();
		var appSettings = httpContext.RequestServices.GetRequiredService<IOptions<AppSettings>>().Value;

		// Try to get tenant ID from AuthContext first, then from header
		var tenantId = authContext.TenantId
			?? httpContext.Request.Headers[appSettings.TENANT_ID_HEADER_KEY].FirstOrDefault();

		if (string.IsNullOrEmpty(tenantId)) {
			return TypedProblems.Unauthorized("Tenant ID is missing", ResponseKeys.Unauthorized);
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
	/// Validates that the tenant ID header is present.
	/// </summary>
	public static RouteGroupBuilder WithCheckTenantHeader(this RouteGroupBuilder builder) {
		return builder.AddEndpointFilter<CheckTenantHeaderFilter>();
	}

	/// <summary>
	/// Adds CheckTenantHeaderFilter to the route handler.
	/// Validates that the tenant ID header is present.
	/// </summary>
	public static RouteHandlerBuilder WithCheckTenantHeader(this RouteHandlerBuilder builder) {
		return builder
			.AddEndpointFilter<CheckTenantHeaderFilter>()
			.Produces<AppProblemDetails>(StatusCodes.Status401Unauthorized, "application/problem+json");
	}
}
