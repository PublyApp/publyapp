using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Permissions.Entities;
using PublyApp.Api.Modules.Permissions.Services;

namespace PublyApp.Api.Lib.Filters;

public class TenantPermissionFilter : IEndpointFilter {
	private readonly Permission[]? _RequiredPermissions;
	private readonly Func<HashSet<string>, bool>? _CustomPermissionChecker;

	public TenantPermissionFilter(Permission[] requiredPermissions) {
		ArgumentNullException.ThrowIfNull(requiredPermissions);
		if (requiredPermissions.Length == 0) {
			throw new ArgumentException("At least one permission is required.", nameof(requiredPermissions));
		}

		this._RequiredPermissions = requiredPermissions;
		this._CustomPermissionChecker = null;
	}

	public TenantPermissionFilter(Func<HashSet<string>, bool> customPermissionChecker) {
		ArgumentNullException.ThrowIfNull(customPermissionChecker);

		this._RequiredPermissions = null;
		this._CustomPermissionChecker = customPermissionChecker;
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

		// SECURITY (#861): a holder of this tenant's full-access system role genuinely
		// bypasses the per-permission check. PermissionService materialises that role as
		// the wildcard sentinel, and the check is scoped to THIS tenant account, so a
		// full-access holder in one tenant never gains rights when the same user is a
		// non-full-access member elsewhere. Everybody else is checked against roles.
		if (
			(this._RequiredPermissions is not null && this._RequiredPermissions.Length > 0)
			|| this._CustomPermissionChecker is not null
		) {
			var userPermissions = await permissionService.GetTenantPermissionsAsync(accountTenant.UserId, tenantId);

			if (userPermissions.Contains(PermissionService.WildcardPermission)) {
				return await next(context);
			}

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

			if (this._CustomPermissionChecker is not null) {
				hasRequiredPermissions = this._CustomPermissionChecker(userPermissions);
			} else if (this._RequiredPermissions is not null && this._RequiredPermissions.Length > 0) {
				var requiredPermissionKeys = this._RequiredPermissions.Select(p => p.Key);
				hasRequiredPermissions = requiredPermissionKeys.All(key => userPermissions.Contains(key));
			} else {
				hasRequiredPermissions = true;
			}

			if (!hasRequiredPermissions) {
				if (logger.IsEnabled(LogLevel.Debug)) {
					logger.LogDebug("Tenant user failed permission check: {@PermissionCheck}", new {
						accountId = accountTenant.Id,
						userId = accountTenant.UserId,
						tenantId,
						userPermissionsCount = userPermissions.Count,
						hasCustomChecker = this._CustomPermissionChecker is not null
					});
				}

				return TypedProblems.Forbidden(
					"User does not have the necessary permissions",
					ResponseKeys.UserDoesNotHaveTheNecessaryPermissions
				);
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
