using MainApi.Localization;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Tenants.Entities;
using MainApi.Src.Modules.Tenants.Services;
using MainApi.Src.Modules.Users.Services;

namespace MainApi.Src.Lib.Filters;

/// <summary>
/// Tenant authorization filter that verifies the authenticated user has access to the tenant.
/// Requires SessionAuthFilter and CheckTenantHeaderFilter to run first.
/// SECURITY (D9): Checks membership FIRST before revealing tenant status to prevent tenant ID probing.
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
				_logger.LogError(
					"Request userId or sessionToken is missing: {UserId}",
					authContext.UserId
				);
				_logger.LogError(
					"{SessionAuthFilter} must be passed before {TenantAuthFilter}",
					nameof(SessionAuthFilter),
					nameof(TenantAuthFilter)
				);
			}
			return TypedProblems.InternalServerError(
				"Failed to authenticate user",
				ResponseKeys.FailedToAuthenticateUser
			);
		}

		// 2. Verify CheckTenantHeaderFilter has run
		if (string.IsNullOrEmpty(authContext.TenantId)) {
			if (_logger.IsEnabled(LogLevel.Error)) {
				_logger.LogError(
					"Tenant ID is missing: {UserId} {TenantId}",
					authContext.UserId,
					authContext.TenantId
				);
				_logger.LogError(
					"{CheckTenantHeaderFilter} must be passed before {TenantAuthFilter}",
					nameof(CheckTenantHeaderFilter),
					nameof(TenantAuthFilter)
				);
			}
			return TypedProblems.InternalServerError(
				"Failed to authenticate user",
				ResponseKeys.FailedToAuthenticateUser
			);
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

		// 4. SECURITY (D9): Check membership FIRST - before even loading the tenant
		// This prevents attackers from probing tenant IDs (they always get 403, never 404)
		var tenantAccount = await accountService.GetUserTenantAccountAsync(
			userId,
			tenantId,
			httpContext.RequestAborted
		);

		if (tenantAccount is null) {
			// User is not a member - give generic 403
			// DON'T reveal whether tenant exists, is suspended, or anything else
			if (_logger.IsEnabled(LogLevel.Debug)) {
				_logger.LogDebug(
					"User {UserId} does not have access to tenant {TenantId}",
					userId,
					tenantId
				);
			}
			return TypedProblems.Forbidden(
				"User does not have access to this tenant",
				ResponseKeys.Forbidden
			);
		}

		// 5. User IS a member - now we can safely load tenant details
		var tenant = await tenantService.GetTenantByIdIncludingSuspendedAsync(
			tenantId,
			httpContext.RequestAborted
		);

		if (tenant is null) {
			// Tenant was deleted - member loses access (generic 403)
			if (_logger.IsEnabled(LogLevel.Warning)) {
				_logger.LogWarning(
					"Tenant {TenantId} not found (possibly deleted) for user {UserId}",
					tenantId,
					userId
				);
			}
			return TypedProblems.Forbidden(
				"User does not have access to this tenant",
				ResponseKeys.Forbidden
			);
		}

		// 6. Check if tenant is suspended - only members see this specific message
		if (tenant.IsSuspended) {
			if (_logger.IsEnabled(LogLevel.Debug)) {
				_logger.LogDebug(
					"User {UserId} attempted to access suspended tenant {TenantId}",
					userId,
					tenantId
				);
			}
			return TypedProblems.Forbidden(
				"This tenant has been suspended",
				ResponseKeys.TenantSuspended
			);
		}

		// 7. Check tenant is in a valid state (Active only at this point)
		if (tenant.Status != TenantStatus.Active) {
			// Pending/non-active tenants - treat as inaccessible (generic 403)
			if (_logger.IsEnabled(LogLevel.Warning)) {
				_logger.LogWarning(
					"Tenant {TenantId} is not active (status: {Status}) for user {UserId}",
					tenantId,
					tenant.Status,
					userId
				);
			}
			return TypedProblems.Forbidden(
				"User does not have access to this tenant",
				ResponseKeys.Forbidden
			);
		}

		// 8. Store account in context for downstream handlers
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
	/// Note: Returns 403 for all access failures (including suspended, deleted, non-member) to prevent
	/// tenant ID probing (D9 security requirement).
	/// </summary>
	public static RouteGroupBuilder WithTenantAuthorization(this RouteGroupBuilder builder) {
		return builder
			.AddEndpointFilter<TenantAuthFilter>()
			.ProducesAppProblem(
				StatusCodes.Status400BadRequest,
				StatusCodes.Status403Forbidden,
				StatusCodes.Status500InternalServerError
			);
	}

	/// <summary>
	/// Adds TenantAuthFilter to the route handler.
	/// Verifies that the authenticated user has access to the tenant.
	/// Requires SessionAuthFilter and CheckTenantHeaderFilter to be applied first.
	/// Note: Returns 403 for all access failures (including suspended, deleted, non-member) to prevent
	/// tenant ID probing (D9 security requirement).
	/// </summary>
	public static RouteHandlerBuilder WithTenantAuthorization(this RouteHandlerBuilder builder) {
		return builder
			.AddEndpointFilter<TenantAuthFilter>()
			.Produces<AppProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")
			.Produces<AppProblemDetails>(StatusCodes.Status403Forbidden, "application/problem+json")
			.Produces<AppProblemDetails>(StatusCodes.Status500InternalServerError, "application/problem+json");
	}
}
