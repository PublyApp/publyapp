using MainApi.Src.Lib;

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

	public async Task InvokeAsync(HttpContext httpContext, IAuthContext authContext)
	{
		// if (!authContext.IsAuthenticated)
		// {
		// 	_logger.LogDebug("User is not authenticated");
		// }
	}
}
