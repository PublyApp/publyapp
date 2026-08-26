using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Auth.Handlers;

public class GetRedirectCodeQuery {
	[FromQuery(Name = "tenant_id")]
	public string? TenantId { get; set; }

	// Query validation rejects malformed tenant_id before the
	// handler runs; here null means no usable tenant hint.
	public Guid? GetTenantId() {
		return QueryPredicates.ParseNullableGuid(TenantId);
	}
}

public class GetRedirectCodeQueryValidator : AbstractValidator<GetRedirectCodeQuery> {
	public GetRedirectCodeQueryValidator() {
		RuleFor(x => x.TenantId)
			.Must(QueryPredicates.BeValidNullableGuid)
			.WithMessage("tenant_id must be a valid GUID");
	}
}

public class GetRedirectCodeResult {
	public string RedirectCode { get; set; } = string.Empty;
	public bool HasSuspendedTenants { get; set; }
}

public sealed class GetRedirectCode {
	public static async Task<Ok<GetRedirectCodeResult>> Handle(
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
			throw new InvalidOperationException("GetRedirectCode must be set behind SessionAuthFilter.");
		}

		if (authContext.UserId is not Guid userId) {
			throw new InvalidOperationException($"{nameof(authContext.UserId)} is not a GUID");
		}

		// Check if user is a staff member
		var isUserStaffUser = await accountService.IsUserStaffUserAsync(userId, cancellationToken);

		if (logger.IsEnabled(LogLevel.Information)) {
			logger.LogInformation(
				"User {UserId} isStaffUser: {IsStaffUser}, tenant_id from query: {TenantId}",
				userId,
				isUserStaffUser,
				query.TenantId
			);
		}

		// Staff users always redirect to staff dashboard
		if (isUserStaffUser) {
			return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = "staff" });
		}

		// Load tenants once - used by both hint validation and fallback
		var tenantsResult = await accountService.GetUserTenantsForPickerAsync(
			userId, limit: 50, cancellationToken: cancellationToken
		);

		var tenantIdHint = query.GetTenantId();

		// If tenant hint provided, validate access (including tenant status)
		if (tenantIdHint is Guid hintTenantId) {
			var isMemberOfActiveTenant =
				await accountService.IsUserMemberOfActiveTenantAsync(
					userId, hintTenantId, cancellationToken
				);

			if (isMemberOfActiveTenant) {
				// Hint is valid - auto-redirect to it
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

			// Hint is stale/invalid - fall through to tenant selection
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
				t.Status == TenantStatus.Active
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
