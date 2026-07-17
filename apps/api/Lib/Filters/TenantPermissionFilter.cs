using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Permissions.Entities;
using PublyApp.Api.Modules.Permissions.Services;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Lib.Filters;

public class TenantPermissionFilter : IEndpointFilter {
	private readonly Permission[]? _requiredPermissions;
	private readonly Func<HashSet<string>, bool>? _customPermissionChecker;

	public TenantPermissionFilter(Permission[] requiredPermissions) {
		ArgumentNullException.ThrowIfNull(requiredPermissions);
		if (requiredPermissions.Length == 0) {
			throw new ArgumentException("At least one permission is required.", nameof(requiredPermissions));
		}

		_requiredPermissions = requiredPermissions;
		_customPermissionChecker = null;
	}

	public TenantPermissionFilter(Func<HashSet<string>, bool> customPermissionChecker) {
		ArgumentNullException.ThrowIfNull(customPermissionChecker);

		_requiredPermissions = null;
		_customPermissionChecker = customPermissionChecker;
	}

	public async ValueTask<object?> InvokeAsync(
		EndpointFilterInvocationContext context,
		EndpointFilterDelegate next
	) {
		var httpContext = context.HttpContext;
		var authContext = httpContext.RequestServices.GetRequiredService<IRequestAuthContext>();
		var accountTenant = authContext.AccountTenant;
		var permissionService = httpContext.RequestServices.GetRequiredService<IPermissionService>();
		var logger = httpContext.RequestServices.GetRequiredService<ILogger<TenantPermissionFilter>>();

		if (accountTenant is null) {
			throw new InvalidOperationException("TenantPermissionFilter must be set behind TenantAuthFilter.");
		}

		if (accountTenant.TenantId is not Guid tenantId) {
			throw new InvalidOperationException("TenantPermissionFilter requires a tenant-scoped account with a TenantId.");
		}

		// SECURITY (#861): a tenant Admin genuinely bypasses the per-permission check —
		// this mirrors the staff Admin bypass in PermissionFilter.cs:41-46. It is a
		// control-flow short-circuit, not a permission-string dump: Admin's
		// profile-derived Permissions list (see GetScopeAuthData) can legitimately stay
		// empty (no profiles assigned), because AccountLevel.Admin on the tenant account
		// is itself the source of truth for "has all rights" in this scope. The bypass is
		// scoped to THIS tenant account only (accountTenant.TenantId), so an Admin in one
		// tenant never gains rights when the same user is a non-admin member elsewhere.
		if (accountTenant.Level != AccountLevel.Admin) {
			// Check if any permissions need to be validated
			if (
				(_requiredPermissions is not null && _requiredPermissions.Length > 0)
				|| _customPermissionChecker is not null
			) {
				// Get user's effective tenant permissions using the profile-derived system.
				var userPermissions = await permissionService.GetTenantPermissionsAsync(accountTenant.UserId, tenantId);

				// early clause guard to avoid unnecessary permission checks
				if (userPermissions.Count == 0) {
					if (logger.IsEnabled(LogLevel.Debug)) {
						logger.LogDebug("Tenant user has no permissions: {@AccountTenant}", new {
							accountId = accountTenant.Id,
							userId = accountTenant.UserId,
							tenantId
						});
					}

					return TypedProblems.Forbidden(
						"User has no permissions",
						ResponseKeys.UserDoesNotHaveTheNecessaryPermissions
					);
				}

				bool hasRequiredPermissions;

				if (_customPermissionChecker is not null) {
					// Use custom permission checker
					hasRequiredPermissions = _customPermissionChecker(userPermissions);
				} else if (_requiredPermissions is not null && _requiredPermissions.Length > 0) {
					// Use default logic: user must have ALL required permissions
					var requiredPermissionKeys = _requiredPermissions.Select(p => p.Key);
					hasRequiredPermissions = requiredPermissionKeys.All(key => userPermissions.Contains(key));
				} else {
					// No permissions required
					hasRequiredPermissions = true;
				}

				if (!hasRequiredPermissions) {
					if (logger.IsEnabled(LogLevel.Debug)) {
						logger.LogDebug("Tenant user failed permission check: {@PermissionCheck}", new {
							accountId = accountTenant.Id,
							userId = accountTenant.UserId,
							tenantId,
							userPermissionsCount = userPermissions.Count,
							hasCustomChecker = _customPermissionChecker is not null
						});
					}

					return TypedProblems.Forbidden(
						"User does not have the necessary permissions",
						ResponseKeys.UserDoesNotHaveTheNecessaryPermissions
					);
				}
			}
		}

		return await next(context);
	}
}

/// <summary>
/// Extension methods for applying TenantPermissionFilter to tenant-scope route groups/handlers.
/// </summary>
public static class TenantPermissionFilterExtensions {
	/// <summary>
	/// Adds TenantPermissionFilter to the route group with required permissions.
	/// All specified permissions are required (AND logic).
	/// </summary>
	public static RouteGroupBuilder WithTenantPermission(
		this RouteGroupBuilder builder,
		Permission[] requiredPermissions
	) {
		return builder
			.AddEndpointFilter(new TenantPermissionFilter(requiredPermissions))
			.WithMetadata(new HasPermissionMetadata())
			.ProducesAppProblem(StatusCodes.Status403Forbidden);
	}

	/// <summary>
	/// Adds TenantPermissionFilter to the route group with a custom permission checker.
	/// </summary>
	public static RouteGroupBuilder WithTenantPermission(
		this RouteGroupBuilder builder,
		Func<HashSet<string>, bool> customPermissionChecker
	) {
		return builder
			.AddEndpointFilter(new TenantPermissionFilter(customPermissionChecker))
			.WithMetadata(new HasPermissionMetadata())
			.ProducesAppProblem(StatusCodes.Status403Forbidden);
	}

	/// <summary>
	/// Adds TenantPermissionFilter to the route handler with required permissions.
	/// All specified permissions are required (AND logic).
	/// </summary>
	public static RouteHandlerBuilder WithTenantPermission(
		this RouteHandlerBuilder builder,
		Permission[] requiredPermissions
	) {
		return builder
			.AddEndpointFilter(new TenantPermissionFilter(requiredPermissions))
			.WithMetadata(new HasPermissionMetadata())
			.ProducesAppProblem(StatusCodes.Status403Forbidden);
	}

	/// <summary>
	/// Adds TenantPermissionFilter to the route handler with a custom permission checker.
	/// </summary>
	public static RouteHandlerBuilder WithTenantPermission(
		this RouteHandlerBuilder builder,
		Func<HashSet<string>, bool> customPermissionChecker
	) {
		return builder
			.AddEndpointFilter(new TenantPermissionFilter(customPermissionChecker))
			.WithMetadata(new HasPermissionMetadata())
			.ProducesAppProblem(StatusCodes.Status403Forbidden);
	}
}
