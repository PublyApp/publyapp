using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Permissions.Entities;
using PublyApp.Api.Modules.Permissions.Services;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Lib.Filters;

public class PermissionFilter : IEndpointFilter {
	private readonly Permission[]? _RequiredPermissions;
	private readonly Func<HashSet<string>, bool>? _CustomPermissionChecker;

	public PermissionFilter(Permission[] requiredPermissions) {
		ArgumentNullException.ThrowIfNull(requiredPermissions);
		if (requiredPermissions.Length == 0) {
			throw new ArgumentException("At least one permission is required.", nameof(requiredPermissions));
		}

		this._RequiredPermissions = requiredPermissions;
		this._CustomPermissionChecker = null;
	}

	public PermissionFilter(Func<HashSet<string>, bool> customPermissionChecker) {
		ArgumentNullException.ThrowIfNull(customPermissionChecker);

		this._RequiredPermissions = null;
		this._CustomPermissionChecker = customPermissionChecker;
	}

	public async ValueTask<object?> InvokeAsync(
		EndpointFilterInvocationContext context,
		EndpointFilterDelegate next
	) {
		var denial = await this._AuthorizeAsync(context);
		if (denial is not null) {
			return denial;
		}

		// Only now, once staff authorization has passed, is the {tenantId} route value
		// trusted: scope the request's context to it so the global tenant filter applies.
		PermissionFilter._ScopeContextToRouteTenant(context.HttpContext);

		return await next(context);
	}

	private static void _ScopeContextToRouteTenant(HttpContext httpContext) {
		var routeTenantId = httpContext.Request.RouteValues["tenantId"]?.ToString();
		if (!Guid.TryParse(routeTenantId, out var tenantId)) {
			return;
		}

		httpContext.RequestServices.GetRequiredService<AppDbContext>().ScopeToTenant(tenantId);
	}

	// Null when the caller is allowed, otherwise the problem result to return.
	private async Task<object?> _AuthorizeAsync(
		EndpointFilterInvocationContext context
	) {
		var services = context.HttpContext.RequestServices;
		var authContext = services.GetRequiredService<IRequestAuthContext>();
		var accountStaff = authContext.AccountStaff;

		if (accountStaff is null) {
			throw new InvalidOperationException("PermissionFilter must be set behind StaffAuthFilter.");
		}

		if (!this._HasRequirement()) {
			return null;
		}

		// Full access is the seeded system role, materialised by PermissionService as
		// the wildcard sentinel. It is the ONLY bypass: every other caller is checked
		// against the permissions their roles grant.
		var userPermissions = await services
			.GetRequiredService<IPermissionService>()
			.GetPermissionsAsync(accountStaff.UserId);

		if (userPermissions.Contains(PermissionService.WildcardPermission)) {
			return null;
		}

		return this._DenialFor(accountStaff, userPermissions, services.GetRequiredService<ILogger<PermissionFilter>>());
	}

	private bool _HasRequirement() {
		return (this._RequiredPermissions is not null && this._RequiredPermissions.Length > 0)
			|| this._CustomPermissionChecker is not null;
	}

	// Null when the (non-wildcard) permission set satisfies the requirement.
	private object? _DenialFor(UserAccount accountStaff, HashSet<string> userPermissions, ILogger logger) {
		if (userPermissions.Count == 0) {
			PermissionFilter._LogDebug(logger, "User has no permissions: {@AccountStaff}", new {
				accountId = accountStaff.Id,
				userId = accountStaff.UserId,
			});

			return TypedProblems.Forbidden(
				"User has no permissions",
				ResponseKeys.UserDoesNotHaveTheNecessaryPermissions
			);
		}

		if (this._Satisfies(userPermissions)) {
			return null;
		}

		PermissionFilter._LogDebug(logger, "User failed permission check: {@PermissionCheck}", new {
			accountId = accountStaff.Id,
			userId = accountStaff.UserId,
			userPermissionsCount = userPermissions.Count,
			hasCustomChecker = this._CustomPermissionChecker is not null
		});

		return TypedProblems.Forbidden(
			"User does not have the necessary permissions",
			ResponseKeys.UserDoesNotHaveTheNecessaryPermissions
		);
	}

	private bool _Satisfies(HashSet<string> userPermissions) {
		if (this._CustomPermissionChecker is not null) {
			return this._CustomPermissionChecker(userPermissions);
		}

		if (this._RequiredPermissions is not null && this._RequiredPermissions.Length > 0) {
			return this._RequiredPermissions.Select(p => p.Key).All(userPermissions.Contains);
		}

		return true;
	}

	private static void _LogDebug(ILogger logger, string message, object details) {
		if (logger.IsEnabled(LogLevel.Debug)) {
			logger.LogDebug(message, details);
		}
	}
}

public static class PermissionFilterExtensions {
	/// <summary>
	/// Adds PermissionFilter to the route group with required permissions.
	/// All specified permissions are required (AND logic).
	/// </summary>
	public static RouteGroupBuilder WithPermission(
		this RouteGroupBuilder builder,
		Permission[] requiredPermissions
	) {
		return builder
			.AddEndpointFilter(new PermissionFilter(requiredPermissions))
			.WithMetadata(new HasPermissionMetadata())
			.ProducesAppProblem(StatusCodes.Status403Forbidden);
	}

	/// <summary>
	/// Adds PermissionFilter to the route group with a custom permission checker.
	/// </summary>
	public static RouteGroupBuilder WithPermission(
		this RouteGroupBuilder builder,
		Func<HashSet<string>, bool> customPermissionChecker
	) {
		return builder
			.AddEndpointFilter(new PermissionFilter(customPermissionChecker))
			.WithMetadata(new HasPermissionMetadata())
			.ProducesAppProblem(StatusCodes.Status403Forbidden);
	}

	/// <summary>
	/// Adds PermissionFilter to the route handler with required permissions.
	/// All specified permissions are required (AND logic).
	/// </summary>
	public static RouteHandlerBuilder WithPermission(
		this RouteHandlerBuilder builder,
		Permission[] requiredPermissions
	) {
		return builder
			.AddEndpointFilter(new PermissionFilter(requiredPermissions))
			.WithMetadata(new HasPermissionMetadata())
			.ProducesAppProblem(StatusCodes.Status403Forbidden);
	}

	/// <summary>
	/// Adds PermissionFilter to the route handler with a custom permission checker.
	/// </summary>
	public static RouteHandlerBuilder WithPermission(
		this RouteHandlerBuilder builder,
		Func<HashSet<string>, bool> customPermissionChecker
	) {
		return builder
			.AddEndpointFilter(new PermissionFilter(customPermissionChecker))
			.WithMetadata(new HasPermissionMetadata())
			.ProducesAppProblem(StatusCodes.Status403Forbidden);
	}
}

public static class PermissionLogic {
	/// <summary>
	/// User must have ANY of the specified permissions (OR logic)
	/// </summary>
	public static Func<HashSet<string>, bool> AnyOf(params Permission[] permissions) {
		var permissionKeys = permissions.Select(p => p.Key).ToHashSet();
		return userPermissions => permissionKeys.Any(key => userPermissions.Contains(key));
	}

	/// <summary>
	/// User must have ALL of the specified permissions (AND logic)
	/// </summary>
	public static Func<HashSet<string>, bool> AllOf(params Permission[] permissions) {
		var permissionKeys = permissions.Select(p => p.Key).ToHashSet();
		return userPermissions => permissionKeys.All(key => userPermissions.Contains(key));
	}

	/// <summary>
	/// Combines multiple permission checkers with OR logic
	/// </summary>
	public static Func<HashSet<string>, bool> OrElse(params Func<HashSet<string>, bool>[] checkers) {
		return userPermissions => checkers.Any(checker => checker(userPermissions));
	}

	/// <summary>
	/// Combines multiple permission checkers with AND logic
	/// </summary>
	public static Func<HashSet<string>, bool> AndAlso(params Func<HashSet<string>, bool>[] checkers) {
		return userPermissions => checkers.All(checker => checker(userPermissions));
	}

	/// <summary>
	/// Checks if user has a specific permission by key
	/// </summary>
	public static Func<HashSet<string>, bool> HasPermission(string permissionKey) {
		return userPermissions => userPermissions.Contains(permissionKey);
	}

	/// <summary>
	/// Checks if user has a specific permission
	/// </summary>
	public static Func<HashSet<string>, bool> HasPermission(Permission permission) {
		return userPermissions => userPermissions.Contains(permission.Key);
	}
}

/// <summary>
/// Endpoint metadata marker attached by every <c>.WithPermission(…)</c> call.
/// Stored in <see cref="Microsoft.AspNetCore.Http.Endpoint.Metadata"/> so that
/// architecture guards and tooling can detect permission enforcement without
/// inspecting the runtime filter pipeline.
/// </summary>
public sealed class HasPermissionMetadata { }
