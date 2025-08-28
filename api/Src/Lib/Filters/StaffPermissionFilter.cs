namespace MainApi.Src.Lib.Filters;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Account;
using MainApi.Src.Lib.Middlewares;
using Microsoft.EntityFrameworkCore;

public class StaffPermissionFilter : IEndpointFilter
{
	private readonly StaffPermission[]? _requiredPermissions;
	private readonly Func<HashSet<string>, bool>? _customPermissionChecker;

	public StaffPermissionFilter(params StaffPermission[] requiredPermissions)
	{
		_requiredPermissions = requiredPermissions;
		_customPermissionChecker = null;
	}

	public StaffPermissionFilter(Func<HashSet<string>, bool> customPermissionChecker)
	{
		_requiredPermissions = null;
		_customPermissionChecker = customPermissionChecker;
	}

	public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
	{
		var httpContext = context.HttpContext;
		var authContext = httpContext.RequestServices.GetRequiredService<IAuthContext>();
		var accountStaff = authContext.AccountStaff;
		var dbContext = httpContext.RequestServices.GetRequiredService<MainApiDbContext>();
		var logger = httpContext.RequestServices.GetRequiredService<ILogger<StaffPermissionFilter>>();

		if (accountStaff == null)
		{
			logger.LogError($"{nameof(AuthContext.AccountStaff)} is null. {nameof(StaffAuthMiddleware)} must be passed before {nameof(StaffPermissionFilter)}");
			return TypedResults.InternalServerError(new
			{
				message = "Internal server error",
				key = "internal-server-error",
			});
		}

		// if user is not admin, check user permissions
		if (accountStaff.HierarchyLevel != AccountHierarchyLevel.Admin)
		{
			var profileIds = accountStaff.ProfileIds;

			// early clause guard to avoid unnecessary database calls
			if (profileIds == null || profileIds.Count == 0)
			{
				logger.LogDebug("User is not an admin and has no profileIds: {@AccountStaff}", new
				{
					accountId = accountStaff.Id,
					userId = accountStaff.UserId,
					sessionToken = authContext.SessionToken,
				});

				return TypedResults.Json(new
				{
					message = "Unauthorized",
					key = "unauthorized",
				}, statusCode: StatusCodes.Status401Unauthorized);
			}

			// Check if any permissions need to be validated
			if ((_requiredPermissions != null && _requiredPermissions.Length > 0) || _customPermissionChecker != null)
			{
				// Get user's profiles from database
				var userProfiles = await dbContext.ProfileStaff
					.Where(p => profileIds.Contains(p.Id!) && p.IsDeleted != true)
					.ToListAsync();

				// Get all permissions from user's profiles
				var userPermissions = userProfiles
					.Where(p => p.Permissions != null)
					.SelectMany(p => p.Permissions!)
					.Distinct()
					.ToHashSet();

				bool hasRequiredPermissions;

				if (_customPermissionChecker != null)
				{
					// Use custom permission checker
					hasRequiredPermissions = _customPermissionChecker(userPermissions);
				}
				else
				{
					// Use default logic: user must have ALL required permissions
					var requiredPermissionKeys = _requiredPermissions!.Select(p => p.Key);
					hasRequiredPermissions = requiredPermissionKeys.All(key => userPermissions.Contains(key));
				}

				if (!hasRequiredPermissions)
				{
					logger.LogDebug("User failed permission check: {@PermissionCheck}", new
					{
						accountId = accountStaff.Id,
						userId = accountStaff.UserId,
						userPermissionsCount = userPermissions.Count,
						hasCustomChecker = _customPermissionChecker != null
						// userPermissions = userPermissions.ToArray(),
					});

					return TypedResults.Json(new
					{
						message = "Insufficient permissions",
						key = "insufficient-permissions",
					}, statusCode: StatusCodes.Status403Forbidden);
				}
			}
		}

		return await next(context);
	}
}

public static class StaffPermissionFilterExtensions
{
	public static RouteHandlerBuilder WithStaffPermission(this RouteHandlerBuilder builder, params StaffPermission[] requiredPermissions)
	{
		return builder.AddEndpointFilter(new StaffPermissionFilter(requiredPermissions));
	}

	public static RouteHandlerBuilder WithStaffPermission(this RouteHandlerBuilder builder, Func<HashSet<string>, bool> customPermissionChecker)
	{
		return builder.AddEndpointFilter(new StaffPermissionFilter(customPermissionChecker));
	}
}

public static class StaffPermissionLogic
{
	/// <summary>
	/// User must have ANY of the specified permissions (OR logic)
	/// </summary>
	public static Func<HashSet<string>, bool> AnyOf(params StaffPermission[] permissions)
	{
		var permissionKeys = permissions.Select(p => p.Key).ToHashSet();
		return userPermissions => permissionKeys.Any(key => userPermissions.Contains(key));
	}

	/// <summary>
	/// User must have ALL of the specified permissions (AND logic)
	/// </summary>
	public static Func<HashSet<string>, bool> AllOf(params StaffPermission[] permissions)
	{
		var permissionKeys = permissions.Select(p => p.Key).ToHashSet();
		return userPermissions => permissionKeys.All(key => userPermissions.Contains(key));
	}

	/// <summary>
	/// Combines multiple permission checkers with OR logic
	/// </summary>
	public static Func<HashSet<string>, bool> OrElse(params Func<HashSet<string>, bool>[] checkers)
	{
		return userPermissions => checkers.Any(checker => checker(userPermissions));
	}

	/// <summary>
	/// Combines multiple permission checkers with AND logic
	/// </summary>
	public static Func<HashSet<string>, bool> AndAlso(params Func<HashSet<string>, bool>[] checkers)
	{
		return userPermissions => checkers.All(checker => checker(userPermissions));
	}

	/// <summary>
	/// Checks if user has a specific permission by key
	/// </summary>
	public static Func<HashSet<string>, bool> HasPermission(string permissionKey)
	{
		return userPermissions => userPermissions.Contains(permissionKey);
	}

	/// <summary>
	/// Checks if user has a specific permission
	/// </summary>
	public static Func<HashSet<string>, bool> HasPermission(StaffPermission permission)
	{
		return userPermissions => userPermissions.Contains(permission.Key);
	}
}

public class StaffPermission
{
	public required string Key { get; init; }
}

public static class StaffPermissionEnum
{
	// ==== TENANTS ====
	public static readonly StaffPermission CAN_ACCESS_TENANTS_LIST = new StaffPermission { Key = "can-access-tenants-list" };
	public static readonly StaffPermission CAN_CREATE_TENANT = new StaffPermission { Key = "can-create-tenant" };

	// ==== USERS ====
	public static readonly StaffPermission CAN_ACCESS_USERS_LIST = new StaffPermission { Key = "can-access-users-list" };
}
