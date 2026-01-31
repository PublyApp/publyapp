using FluentValidation;

using MainApi.Src.Lib;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Auth.Handlers;

public class GetRedirectCodeQuery {
	public string? TenantId { get; set; }

	public Guid? GetTenantId() {
		return Guid.TryParse(TenantId, out var tenantId) ? tenantId : null;
	}
}

public class GetRedirectCodeQueryValidator : AbstractValidator<GetRedirectCodeQuery> {
	public GetRedirectCodeQueryValidator() {
		// TenantId is optional, so no validation rules needed
	}
}

public class GetRedirectCodeResult {
	public string RedirectCode { get; set; } = string.Empty;
}

public class GetRedirectCode {
	public static async Task<Ok<GetRedirectCodeResult>> HandleGetRedirectCode(
		[AsParameters] GetRedirectCodeQuery query,
		IRequestAuthContext authContext,
		ILogger<GetRedirectCode> logger,
		[FromServices] IAccountService accountService,
		CancellationToken cancellationToken
	) {
		if (!authContext.IsAuthenticated) {
			if (logger.IsEnabled(LogLevel.Error)) {
				logger.LogError(
					"GetRedirectCode called without authentication. UserId: {UserId}",
					authContext.UserId
				);
			}
			throw new Exception($"GetRedirectCode must be set behind SessionAuthFilter.");
		}

		if (authContext.UserId is not Guid userId) {
			throw new Exception($"{nameof(authContext.UserId)} is not a GUID");
		}

		// Check if user is a staff member
		var isUserStaffUser = await accountService.IsUserStaffUserAsync(userId, cancellationToken);

		if (logger.IsEnabled(LogLevel.Information)) {
			logger.LogInformation(
				"User {UserId} isStaffUser: {IsStaffUser}, tenantId from query: {TenantId}",
				userId,
				isUserStaffUser,
				query.TenantId
			);
		}

		// Staff users always redirect to staff dashboard
		if (isUserStaffUser) {
			return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = "staff" });
		}

		var tenantIdHint = query.GetTenantId();

		// If tenant hint provided, validate access (including tenant status)
		if (tenantIdHint is Guid hintTenantId) {
			// Use method that checks BOTH account AND tenant status
			var isMemberOfActiveTenant = await accountService.IsUserMemberOfActiveTenantAsync(
				userId, hintTenantId, cancellationToken
			);

			if (isMemberOfActiveTenant) {
				// Hint is valid - use it
				if (logger.IsEnabled(LogLevel.Information)) {
					logger.LogInformation(
						"Using valid tenant hint {TenantId} for user {UserId}",
						hintTenantId, userId
					);
				}
				return TypedResults.Ok(new GetRedirectCodeResult {
					RedirectCode = hintTenantId.ToString()
				});
			}

			// Hint is stale/invalid (user not member, or tenant suspended/inactive/deleted)
			// Fall through to tenant selection instead of hard "unauthorized"
			if (logger.IsEnabled(LogLevel.Information)) {
				logger.LogInformation(
					"Stale tenant hint {TenantId} for user {UserId}, falling through to selection",
					hintTenantId, userId
				);
			}
		}

		// No valid hint - determine redirect based on tenant count
		// Limit of 2 is enough: we only need to know if there's 0, 1, or ≥2 tenants
		var tenantsResult = await accountService.GetUserTenantsAsync(
			userId, limit: 2, cancellationToken: cancellationToken
		);

		if (tenantsResult.TotalCount == 0) {
			// No tenants - unauthorized
			if (logger.IsEnabled(LogLevel.Warning)) {
				logger.LogWarning(
					"User {UserId} has no active tenants, returning unauthorized",
					userId
				);
			}
			return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = "unauthorized" });
		}

		if (tenantsResult.TotalCount == 1) {
			// Exactly 1 tenant - redirect directly
			var singleTenant = tenantsResult.Tenants[0];
			if (logger.IsEnabled(LogLevel.Information)) {
				logger.LogInformation(
					"User {UserId} has single tenant {TenantId}, redirecting directly",
					userId, singleTenant.Id
				);
			}
			return TypedResults.Ok(new GetRedirectCodeResult {
				RedirectCode = singleTenant.Id.ToString()
			});
		}

		// Multiple tenants - show picker
		if (logger.IsEnabled(LogLevel.Information)) {
			logger.LogInformation(
				"User {UserId} has {TenantCount} tenants, returning tenant-picker",
				userId, tenantsResult.TotalCount
			);
		}
		return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = "tenant-picker" });
	}
}
