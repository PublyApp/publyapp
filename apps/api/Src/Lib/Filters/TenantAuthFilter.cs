using MainApi.Localization;

namespace MainApi.Src.Lib.Filters;

/// <summary>
/// Placeholder for tenant authorization filter.
/// This filter should verify that the authenticated user has access to the tenant.
/// Requires SessionAuthFilter and CheckTenantHeaderFilter to run first.
/// </summary>
public class TenantAuthFilter : IEndpointFilter {
	private readonly ILogger<TenantAuthFilter> _logger;

	public TenantAuthFilter(ILogger<TenantAuthFilter> logger) {
		_logger = logger;
	}

	public async ValueTask<object?> InvokeAsync(
		EndpointFilterInvocationContext context,
		EndpointFilterDelegate next
	) {
		var httpContext = context.HttpContext;
		var authContext = httpContext.RequestServices.GetRequiredService<IAuthContext>();
		var tenantContext = httpContext.RequestServices.GetRequiredService<ITenantContext>();

		// TODO: Implement tenant authorization logic
		// This should verify that:
		// 1. User is authenticated (checked by SessionAuthFilter)
		// 2. Tenant ID is present (checked by CheckTenantHeaderFilter)
		// 3. User has access to the specified tenant

		if (!authContext.IsAuthenticated) {
			_logger.LogError("Request userId or sessionToken is missing: {@TenantAuthData}", new {
				UserId = authContext.UserId,
			});
			_logger.LogError("{SessionAuthFilter} must be passed before {TenantAuthFilter}", nameof(SessionAuthFilter), nameof(TenantAuthFilter));
			return TypedResults.Json(
				ApiResponse.Create("Failed to authenticate user", ResponseKeys.FailedToAuthenticateUser),
				statusCode: StatusCodes.Status500InternalServerError
			);
		}

		if (string.IsNullOrEmpty(tenantContext.TenantId)) {
			_logger.LogError("Tenant ID is missing: {@TenantAuthData}", new {
				UserId = authContext.UserId,
				TenantId = tenantContext.TenantId,
			});
			_logger.LogError(
				"{CheckTenantHeaderFilter} must be passed before {TenantAuthFilter}",
				nameof(CheckTenantHeaderFilter),
				nameof(TenantAuthFilter)
			);
			return TypedResults.Json(
				ApiResponse.Create("Failed to authenticate user", ResponseKeys.FailedToAuthenticateUser),
				statusCode: StatusCodes.Status500InternalServerError
			);
		}

		// For now, just pass through - implement tenant verification logic later
		return await next(context);
	}
}

/// <summary>
/// Extension methods for applying TenantAuthFilter to route groups and individual routes.
/// </summary>
public static class TenantAuthFilterExtensions {
	/// <summary>
	/// Adds TenantAuthFilter to the route group.
	/// Verifies that the authenticated user has access to the tenant.
	/// Requires SessionAuthFilter and CheckTenantHeaderFilter to be applied first.
	/// </summary>
	public static RouteGroupBuilder WithTenantAuthorization(this RouteGroupBuilder builder) {
		return builder.AddEndpointFilter<TenantAuthFilter>();
	}

	/// <summary>
	/// Adds TenantAuthFilter to the route handler.
	/// Verifies that the authenticated user has access to the tenant.
	/// Requires SessionAuthFilter and CheckTenantHeaderFilter to be applied first.
	/// </summary>
	public static RouteHandlerBuilder WithTenantAuthorization(this RouteHandlerBuilder builder) {
		return builder.AddEndpointFilter<TenantAuthFilter>();
	}
}
