using MainApi.Localization;
using MainApi.Src.Modules.Shared.Tenants;
using MainApi.Src.Modules.Shared.Users;

namespace MainApi.Src.Lib.Filters;

/// <summary>
/// Tenant authorization filter that verifies the authenticated user has access to the tenant.
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
		var authContext = httpContext.RequestServices.GetRequiredService<IRequestAuthContext>();
		var accountService = httpContext.RequestServices.GetRequiredService<IAccountService>();
		var tenantService = httpContext.RequestServices.GetRequiredService<ITenantService>();

		// 1. Verify SessionAuthFilter has run
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

		// 2. Verify CheckTenantHeaderFilter has run
		if (string.IsNullOrEmpty(authContext.TenantId)) {
			_logger.LogError("Tenant ID is missing: {@TenantAuthData}", new {
				UserId = authContext.UserId,
				TenantId = authContext.TenantId,
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

		if (authContext.UserId is not Guid userId) {
			throw new InvalidOperationException("User ID is not a valid GUID");
		}

		// 3. Parse tenant ID
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			_logger.LogWarning(
				"Invalid tenant ID format: {TenantId}",
				authContext.TenantId
			);
			return TypedResults.Json(
				ApiResponse.Create("Unauthorized", ResponseKeys.Unauthorized),
				statusCode: StatusCodes.Status401Unauthorized
			);
		}

		// 4. Verify tenant exists and is active
		var tenant = await tenantService.GetTenantByIdAsync(tenantId, httpContext.RequestAborted);

		if (tenant is null) {
			_logger.LogWarning(
				"Tenant not found or inactive: {TenantId}",
				tenantId
			);
			return TypedResults.Json(
				ApiResponse.Create("Tenant not found", ResponseKeys.NotFound),
				statusCode: StatusCodes.Status404NotFound
			);
		}

		// 5. Get user's account for this tenant
		var tenantAccount = await accountService.GetUserTenantAccountAsync(
			userId,
			tenantId,
			httpContext.RequestAborted
		);

		if (tenantAccount is null) {
			_logger.LogDebug(
				"User {UserId} does not have access to tenant {TenantId}",
				userId,
				tenantId
			);
			return TypedResults.Json(
				ApiResponse.Create("Unauthorized", ResponseKeys.Unauthorized),
				statusCode: StatusCodes.Status403Forbidden
			);
		}

		// 6. Store account in context for downstream handlers
		authContext.AccountTenant = tenantAccount;

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
