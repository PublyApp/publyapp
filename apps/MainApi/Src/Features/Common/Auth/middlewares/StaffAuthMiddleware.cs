using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Features.Common.Auth.Middlewares;

public class StaffAuthMiddleware
{
	private readonly ILogger<StaffAuthMiddleware> _logger;
	private readonly RequestDelegate _next;

	public StaffAuthMiddleware(RequestDelegate next, ILogger<StaffAuthMiddleware> logger)
	{
		_logger = logger;
		_next = next;
	}

	public async Task InvokeAsync(HttpContext httpContext, MainApiDbContext dbContext, IAuthContext authContext)
	{
		if (!authContext.IsAuthenticated)
		{
			_logger.LogError("Request userId or sessionToken is missing: {logData}", new
			{
				userId = authContext.UserId,
				sessionToken = authContext.SessionToken,
			});
			_logger.LogError($"{nameof(SessionAuthMiddleware)} must be passed before {nameof(StaffAuthMiddleware)}");
			httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;
			await httpContext.Response.WriteAsJsonAsync(new
			{
				message = "Failed to authenticate user",
				key = "failed-to-authenticate-user",
			});
			return;
		}

		// verify if the user is a staff member
		var accountStaff = await dbContext.UserAccountStaff.FirstOrDefaultAsync(u =>
			u.UserId == authContext.UserId &&
			u.IsDeleted != true &&
			u.IsSuspended != true);

		if (accountStaff is null)
		{
			_logger.LogDebug("User is not a staff member: {logData}", new { authContext.UserId });
			httpContext.Response.StatusCode = StatusCodes.Status401Unauthorized;
			await httpContext.Response.WriteAsJsonAsync(new
			{
				message = "Unauthorized",
				key = "unauthorized",
			});
			return;
		}

		authContext.AccountStaff = accountStaff;
		await _next(httpContext);
	}
}
