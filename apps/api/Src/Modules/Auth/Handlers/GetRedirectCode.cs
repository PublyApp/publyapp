using FluentValidation;

using MainApi.Src.Lib;
using MainApi.Src.Modules.Tenants.Entities;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Auth.Handlers;

public class GetRedirectCodeQuery {
	[FromQuery]
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
	public bool HasSuspendedTenants { get; set; }
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

		// User is not a staff member, check tenant access
		if (tenantId is not Guid guidTenantIdAsMember) {
			// No tenantId provided, find user's first tenant account
			var userFirstTenantAccount = await accountService.FindUserTenantAccountsAsync(
				userId, limit: 1, cancellationToken: cancellationToken
			);

			if (logger.IsEnabled(LogLevel.Information)) {
				logger.LogInformation(
					"FindUserTenantAccountsAsync for user {UserId} returned {Count} accounts",
					userId,
					userFirstTenantAccount.Count
				);
			}

			var firstTenant = userFirstTenantAccount.FirstOrDefault();

			if (firstTenant?.TenantId is not null) {
				if (logger.IsEnabled(LogLevel.Information)) {
					logger.LogInformation(
						"Redirecting user {UserId} to tenant {TenantId}",
						userId,
						firstTenant.TenantId.Value
					);
				}
				return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = firstTenant.TenantId.Value.ToString() });
			}

			if (logger.IsEnabled(LogLevel.Warning)) {
				logger.LogWarning(
					"User {UserId} has no tenant accounts, returning unauthorized",
					userId
				);
			}
			return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = "unauthorized" });
		}

		// Exactly 1 ACTIVE tenant - redirect directly
		if (tenantsResult.ActiveCount == 1) {
			var activeTenant = tenantsResult.Tenants.First(t =>
				t.Status == Tenant.GetStatusDescription(TenantStatus.Active)
			);
			if (logger.IsEnabled(LogLevel.Information)) {
				logger.LogInformation(
					"User {UserId} has single active tenant {TenantId}, redirecting directly",
					userId, activeTenant.Id
				);
			}
			return TypedResults.Ok(new GetRedirectCodeResult {
				RedirectCode = activeTenant.Id.ToString(),
				HasSuspendedTenants = tenantsResult.HasSuspendedTenants,
			});
		}

		// Multiple active tenants OR all suspended - show picker
		if (logger.IsEnabled(LogLevel.Information)) {
			logger.LogInformation(
				"User {UserId} provided tenantId {TenantId}, checking access",
				userId,
				guidTenantIdAsMember
			);
		}

		var tenantFound = await tenantService.GetTenantByIdAsync(guidTenantIdAsMember, cancellationToken);

		if (tenantFound is not null) {
			var isMember = await accountService.IsUserMemberOfTenantAsync(userId, guidTenantIdAsMember, cancellationToken);

			if (logger.IsEnabled(LogLevel.Information)) {
				logger.LogInformation(
					"User {UserId} isMember of tenant {TenantId}: {IsMember}",
					userId,
					guidTenantIdAsMember,
					isMember
				);
			}

			if (isMember) {
				return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = tenantFound.GetRequiredId().ToString() });
			}

			if (logger.IsEnabled(LogLevel.Warning)) {
				logger.LogWarning(
					"Attempt to access tenant {TenantId} by user {UserId} who is not a member of said tenant",
					tenantId,
					userId
				);
			}

			return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = "unauthorized" });
		}

		if (logger.IsEnabled(LogLevel.Information)) {
			logger.LogInformation(
				"Tenant {TenantId} not found or inactive, looking for fallback",
				guidTenantIdAsMember
			);
		}

		// Get fallback tenant (first tenant the user is a member of)
		var userTenantAccounts = await accountService.FindUserTenantAccountsAsync(
			userId, limit: 1, cancellationToken: cancellationToken
		);

		var tenantIdHint = query.GetTenantId();

		// If tenant hint provided, validate access (including tenant status)
		if (tenantIdHint is Guid hintTenantId) {
			var isMemberOfActiveTenant =
				await accountService.IsUserMemberOfActiveTenantAsync(
					userId, hintTenantId, cancellationToken
				);

			if (isMemberOfActiveTenant) {
				// Hint is valid — auto-redirect to it
				if (logger.IsEnabled(LogLevel.Information)) {
					logger.LogInformation(
						"Using valid tenant hint {TenantId} for user {UserId}",
						hintTenantId, userId
					);
				}
				return TypedResults.Ok(new GetRedirectCodeResult {
					RedirectCode = hintTenantId.ToString(),
					HasSuspendedTenants = tenantsResult.HasSuspendedTenants,
				});
			}

			// Hint is stale/invalid — fall through to tenant selection
			if (logger.IsEnabled(LogLevel.Information)) {
				logger.LogInformation(
					"Stale tenant hint {TenantId} for user {UserId}, "
						+ "falling through to selection",
					hintTenantId, userId
				);
			}
		}

		// No tenants at all (not even suspended) - unauthorized
		if (tenantsResult.TotalCount == 0) {
			if (logger.IsEnabled(LogLevel.Warning)) {
				logger.LogWarning(
					"User {UserId} has no tenants (including suspended), returning unauthorized",
					userId
				);
			}
			return TypedResults.Ok(new GetRedirectCodeResult {
				RedirectCode = "unauthorized",
			});
		}

		// Exactly 1 ACTIVE tenant - redirect directly
		if (tenantsResult.ActiveCount == 1) {
			var activeTenant = tenantsResult.Tenants.First(t =>
				t.Status == Tenant.GetStatusDescription(TenantStatus.Active)
			);
			if (logger.IsEnabled(LogLevel.Information)) {
				logger.LogInformation(
					"User {UserId} has single active tenant {TenantId}, redirecting directly",
					userId, activeTenant.Id
				);
			}
			return TypedResults.Ok(new GetRedirectCodeResult {
				RedirectCode = activeTenant.Id.ToString(),
				HasSuspendedTenants = tenantsResult.HasSuspendedTenants,
			});
		}

		// Multiple active tenants OR all suspended - show picker
		if (logger.IsEnabled(LogLevel.Information)) {
			logger.LogInformation(
				"User {UserId} has {TotalCount} tenants ({ActiveCount} active), returning tenant-picker",
				userId, tenantsResult.TotalCount, tenantsResult.ActiveCount
			);
		}
		return TypedResults.Ok(new GetRedirectCodeResult {
			RedirectCode = "tenant-picker",
			HasSuspendedTenants = tenantsResult.HasSuspendedTenants,
		});
	}
}
