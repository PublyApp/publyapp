namespace MainApi.Src.Lib.Filters;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Account;
using MainApi.Src.Lib.Middlewares;

// public class BodyValidationFailResult : AppResponseResult
// {
// 	public new string Message { get; set; } = "Validation failed";
// 	public new string Key { get; set; } = "validation-failed";
// 	public object FieldErrors { get; set; } = new Dictionary<string, string[]>();
// }

public class StaffPermissionFilter : IEndpointFilter
{
	private readonly ILogger<StaffPermissionFilter> _logger;

	public StaffPermissionFilter(ILogger<StaffPermissionFilter> logger)
	{
		_logger = logger;
	}

	public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
	{
		var httpContext = context.HttpContext;
		var authContext = httpContext.RequestServices.GetRequiredService<IAuthContext>();
		var accountStaff = authContext.AccountStaff;
		var dbContext = httpContext.RequestServices.GetRequiredService<MainApiDbContext>();

		if (accountStaff == null)
		{
			_logger.LogError($"{nameof(AuthContext.AccountStaff)} is null. {nameof(StaffAuthMiddleware)} must be passed before {nameof(StaffPermissionFilter)}");
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
				_logger.LogDebug("User is not an admin and has no profileIds: {@AccountStaff}", new
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

			// var profile = await dbContext.ProfileStaff.ToListAsync(profileIds);

			// accountStaff.ProfileIds
			// return TypedResults.Forbidden(new
			// {
			// 	message = "Unauthorized",
			// 	key = "unauthorized",
			// });
		}

		return await next(context);
	}
}

public static class StaffPermissionFilterExtensions
{
	public static RouteHandlerBuilder WithStaffPermission(this RouteHandlerBuilder builder)
	{
		return builder.AddEndpointFilter<StaffPermissionFilter>();
	}
}

