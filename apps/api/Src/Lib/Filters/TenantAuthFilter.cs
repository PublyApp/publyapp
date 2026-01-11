using MainApi.Localization;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.ProblemResults;
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
			if (_logger.IsEnabled(LogLevel.Error)) {
				_logger.LogError("Request userId or sessionToken is missing: {UserId}", authContext.UserId);
				_logger.LogError("{SessionAuthFilter} must be passed before {TenantAuthFilter}", nameof(SessionAuthFilter), nameof(TenantAuthFilter));
			}
			return TypedProblems.InternalServerError("Failed to authenticate user", ResponseKeys.FailedToAuthenticateUser);
		}

		// 2. Verify CheckTenantHeaderFilter has run
		if (string.IsNullOrEmpty(authContext.TenantId)) {
			if (_logger.IsEnabled(LogLevel.Error)) {
				_logger.LogError("Tenant ID is missing: {UserId} {TenantId}", authContext.UserId, authContext.TenantId);
				_logger.LogError(
					"{CheckTenantHeaderFilter} must be passed before {TenantAuthFilter}",
					nameof(CheckTenantHeaderFilter),
					nameof(TenantAuthFilter)
				);
			}
			return TypedProblems.InternalServerError("Failed to authenticate user", ResponseKeys.FailedToAuthenticateUser);
		}

		if (authContext.UserId is not Guid userId) {
			throw new InvalidOperationException("User ID is not a valid GUID");
		}

		// 3. Parse tenant ID
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			if (_logger.IsEnabled(LogLevel.Warning)) {
				_logger.LogWarning(
					"Invalid tenant ID format: {TenantId}",
					authContext.TenantId
				);
			}
			return TypedProblems.BadRequest("Invalid tenant ID format", ResponseKeys.BadRequest);
		}

		// 4. Verify tenant exists and is active
		var tenant = await tenantService.GetTenantByIdAsync(tenantId, httpContext.RequestAborted);

		if (tenant is null) {
			if (_logger.IsEnabled(LogLevel.Warning)) {
				_logger.LogWarning(
					"Tenant not found or inactive: {TenantId}",
					tenantId
				);
			}
			return TypedProblems.NotFound("Tenant not found", ResponseKeys.NotFound);
		}

		// 5. Get user's account for this tenant
		var tenantAccount = await accountService.GetUserTenantAccountAsync(
			userId,
			tenantId,
			httpContext.RequestAborted
		);

		if (tenantAccount is null) {
			if (_logger.IsEnabled(LogLevel.Debug)) {
				_logger.LogDebug(
					"User {UserId} does not have access to tenant {TenantId}",
					userId,
					tenantId
				);
			}
			return TypedProblems.Forbidden("User does not have access to this tenant", ResponseKeys.Forbidden);
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
		return builder
			.AddEndpointFilter<TenantAuthFilter>()
			.ProducesAppProblem(
				StatusCodes.Status400BadRequest,
				StatusCodes.Status403Forbidden,
				StatusCodes.Status404NotFound,
				StatusCodes.Status500InternalServerError
			);
	}

	/// <summary>
	/// Adds TenantAuthFilter to the route handler.
	/// Verifies that the authenticated user has access to the tenant.
	/// Requires SessionAuthFilter and CheckTenantHeaderFilter to be applied first.
	/// </summary>
	public static RouteHandlerBuilder WithTenantAuthorization(this RouteHandlerBuilder builder) {
		return builder
			.AddEndpointFilter<TenantAuthFilter>()
			.Produces<AppProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")
			.Produces<AppProblemDetails>(StatusCodes.Status403Forbidden, "application/problem+json")
			.Produces<AppProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")
			.Produces<AppProblemDetails>(StatusCodes.Status500InternalServerError, "application/problem+json");
	}
}
