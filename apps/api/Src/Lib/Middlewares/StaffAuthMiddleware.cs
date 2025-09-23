using MainApi.Localization;
using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Account;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Lib.Middlewares;

public class StaffAuthMiddleware {
	private readonly ILogger<StaffAuthMiddleware> _logger;
	private readonly RequestDelegate _next;

	public StaffAuthMiddleware(RequestDelegate next, ILogger<StaffAuthMiddleware> logger) {
		_logger = logger;
		_next = next;
	}

	public async Task InvokeAsync(HttpContext httpContext, MainApiDbContext dbContext, IAuthContext authContext) {
		if (!authContext.IsAuthenticated) {
			_logger.LogError("Request userId or sessionToken is missing: {@StaffAuthData}", new {
				userId = authContext.UserId,
				sessionToken = authContext.SessionToken,
			});
			_logger.LogError($"{nameof(SessionAuthMiddleware)} must be passed before {nameof(StaffAuthMiddleware)}");
			httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;
			await httpContext.Response.WriteAsJsonAsync(ApiResponse.Create(
				"Failed to authenticate user",
				ResponseKeys.FailedToAuthenticateUser
			));
			return;
		}

		// verify if the user is a staff member
		var accountStaff = await dbContext.UserAccount.FirstOrDefaultAsync(u =>
			u.UserId == authContext.UserId &&
			u.AccountType == AccountType.Staff &&
			!u.IsDeleted &&
			!u.IsSuspended);

		if (accountStaff is null) {
			_logger.LogDebug("User is not a staff member: {@StaffAuthData}", new { UserId = authContext.UserId });
			httpContext.Response.StatusCode = StatusCodes.Status401Unauthorized;
			await httpContext.Response.WriteAsJsonAsync(
				ApiResponse.Create("Unauthorized", ResponseKeys.Unauthorized)
			);
			return;
		}

		authContext.AccountStaff = accountStaff;
		await _next(httpContext);
	}
}

// Extension method
public static class StaffAuthMiddlewareExtensions {
	private static bool ShouldUseStaffAuthorization(HttpContext context) {
		return context.Request.Path.StartsWithSegments("/staff");
	}

	private static void ConfigureStaffAuthorization(IApplicationBuilder builder) {
		builder.UseMiddleware<StaffAuthMiddleware>();
	}

	public static IApplicationBuilder UseStaffAuthorization(this IApplicationBuilder app) {
		app.UseWhen(ShouldUseStaffAuthorization, ConfigureStaffAuthorization);
		return app;
	}
}
