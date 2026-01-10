using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Shared.Permissions;
using MainApi.Src.Modules.Shared.Users;

namespace MainApi.Src.Lib.Filters;

public class PermissionFilter : IEndpointFilter {
	private readonly Permission[]? _requiredPermissions;
	private readonly Func<HashSet<string>, bool>? _customPermissionChecker;

	public PermissionFilter(Permission[] requiredPermissions) {
		ArgumentNullException.ThrowIfNull(requiredPermissions);
		if (requiredPermissions.Length == 0)
			throw new ArgumentException("At least one permission is required.", nameof(requiredPermissions));

		_requiredPermissions = requiredPermissions;
		_customPermissionChecker = null;
	}

	public PermissionFilter(Func<HashSet<string>, bool> customPermissionChecker) {
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
		var accountStaff = authContext.AccountStaff;
		var permissionService = httpContext.RequestServices.GetRequiredService<IPermissionService>();
		var logger = httpContext.RequestServices.GetRequiredService<ILogger<PermissionFilter>>();

		if (accountStaff == null) {
			throw new Exception("PermissionFilter must be set behind StaffAuthFilter.");
		}

		// if user is not admin, check user permissions
		if (accountStaff.Level != AccountLevel.Admin) {
			// Check if any permissions need to be validated
			if (
				(_requiredPermissions is not null && _requiredPermissions.Length > 0)
				|| _customPermissionChecker is not null
			) {
				// Get user's effective permissions using the new unified system
				var userPermissions = await permissionService.GetPermissionsAsync(accountStaff.UserId);

				// early clause guard to avoid unnecessary permission checks
				if (userPermissions.Count == 0) {
					if (logger.IsEnabled(LogLevel.Debug)) {
						logger.LogDebug("User is not an admin and has no permissions: {@AccountStaff}", new {
							accountId = accountStaff.Id,
							userId = accountStaff.UserId,
							sessionToken = authContext.SessionToken,
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
						logger.LogDebug("User failed permission check: {@PermissionCheck}", new {
							accountId = accountStaff.Id,
							userId = accountStaff.UserId,
							userPermissionsCount = userPermissions.Count,
							hasCustomChecker = _customPermissionChecker != null
							// userPermissions = userPermissions.ToArray(),
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

public static class PermissionFilterExtensions {
	public static RouteHandlerBuilder WithPermission(
		this RouteHandlerBuilder builder,
		Permission[] requiredPermissions
	) {
		return builder
			.AddEndpointFilter(new PermissionFilter(requiredPermissions))
			.Produces<AppProblemDetails>(StatusCodes.Status403Forbidden, "application/problem+json");
	}

	public static RouteHandlerBuilder WithPermission(
		this RouteHandlerBuilder builder,
		Func<HashSet<string>, bool> customPermissionChecker
	) {
		return builder
			.AddEndpointFilter(new PermissionFilter(customPermissionChecker))
			.Produces<AppProblemDetails>(StatusCodes.Status403Forbidden, "application/problem+json");
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
