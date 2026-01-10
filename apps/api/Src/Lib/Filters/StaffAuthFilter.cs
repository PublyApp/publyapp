using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Shared.Users;

namespace MainApi.Src.Lib.Filters;

/// <summary>
/// Verifies that the authenticated user has a staff account.
/// Requires SessionAuthFilter to run first.
/// Sets AccountStaff in AuthContext after successful verification.
/// </summary>
public class StaffAuthFilter : IEndpointFilter {
	private readonly ILogger<StaffAuthFilter> _logger;

	public StaffAuthFilter(ILogger<StaffAuthFilter> logger) {
		_logger = logger;
	}

	public async ValueTask<object?> InvokeAsync(
		EndpointFilterInvocationContext context,
		EndpointFilterDelegate next
	) {
		var httpContext = context.HttpContext;
		var authContext = httpContext.RequestServices.GetRequiredService<IRequestAuthContext>();
		var accountService = httpContext.RequestServices.GetRequiredService<IAccountService>();

		if (!authContext.IsAuthenticated) {
			if (_logger.IsEnabled(LogLevel.Error)) {
				_logger.LogError("Request userId or sessionToken is missing: {UserId}", authContext.UserId);
				_logger.LogError(
					"{SessionAuthFilter} must be passed before {StaffAuthFilter}",
					nameof(SessionAuthFilter),
					nameof(StaffAuthFilter)
				);
			}
			return TypedProblems.InternalServerError("Failed to authenticate user", ResponseKeys.FailedToAuthenticateUser);
		}

		if (authContext.UserId is not Guid userId) {
			throw new InvalidOperationException("User ID is not a valid GUID");
		}

		// Verify if the user is a staff member
		var accountStaff = await accountService
			.GetUserStaffAccountAsync(userId, httpContext.RequestAborted);

		if (accountStaff is null) {
			if (_logger.IsEnabled(LogLevel.Debug)) {
				_logger.LogDebug("User is not a staff member: {UserId}", authContext.UserId);
			}
			return TypedProblems.Forbidden("User is not a staff member", ResponseKeys.NotAStaffMember);
		}

		authContext.AccountStaff = accountStaff;
		return await next(context);
	}
}

/// <summary>
/// Extension methods for applying StaffAuthFilter to route groups and individual routes.
/// </summary>
public static class StaffAuthFilterExtensions {
	/// <summary>
	/// Adds StaffAuthFilter to the route group.
	/// Verifies that the authenticated user has a staff account.
	/// Requires SessionAuthFilter to be applied first.
	/// </summary>
	public static RouteGroupBuilder WithStaffAuthorization(this RouteGroupBuilder builder) {
		return builder.AddEndpointFilter<StaffAuthFilter>();
	}

	/// <summary>
	/// Adds StaffAuthFilter to the route handler.
	/// Verifies that the authenticated user has a staff account.
	/// Requires SessionAuthFilter to be applied first.
	/// </summary>
	public static RouteHandlerBuilder WithStaffAuthorization(this RouteHandlerBuilder builder) {
		return builder
			.AddEndpointFilter<StaffAuthFilter>()
			.Produces<AppProblemDetails>(StatusCodes.Status403Forbidden, "application/problem+json")
			.Produces<AppProblemDetails>(StatusCodes.Status500InternalServerError, "application/problem+json");
	}
}
