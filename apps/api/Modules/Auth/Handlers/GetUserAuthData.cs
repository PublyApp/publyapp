using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Permissions.Services;
using PublyApp.Api.Modules.Users.Entities;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Auth.Handlers;

public class GetUserAuthDataResult {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public string? AvatarUrl { get; set; }
	public string? FirstName { get; set; }
	public string? LastName { get; set; }

	/// <summary>
	/// The caller's EFFECTIVE tenant permission set for the ?tenant_id= scope:
	/// ["*"] when the resolved account is a tenant Admin (the #861
	/// AccountLevel.Admin short-circuit TenantPermissionFilter applies), otherwise
	/// the profile-derived keys. Empty array — never null — whenever there is
	/// no usable scope (missing/malformed tenant_id, unknown or suspended
	/// account), gating everything closed.
	/// </summary>
	public IReadOnlyList<string> TenantPermissionKeys { get; set; } =
		(string[])[];
}

public sealed class GetUserAuthData {
	public static async Task<
	Results<
		Ok<GetUserAuthDataResult>,
		AppUnauthorizedHttpResult
		>
	> Handle(
		IRequestAuthContext authContext,
		ILogger<GetUserAuthData> logger,
		[FromServices] IUserService userService,
		[FromServices] IAccountService accountService,
		[FromServices] IPermissionService permissionService,
		[FromQuery(Name = "tenant_id")] string? tenantId,
		CancellationToken cancellationToken
	) {
		if (!authContext.IsAuthenticated) {
			if (logger.IsEnabled(LogLevel.Error)) {
				logger.LogError("{@GetUserAuthData}", new {
					UserId = authContext.UserId,
					HasSessionToken = authContext.SessionToken is not null
				});
			}
			throw new InvalidOperationException("GetUserAuthData must be set behind SessionAuthFilter.");
		}

		if (authContext.UserId is not Guid userId) {
			throw new InvalidOperationException($"{nameof(authContext.UserId)} is not a GUID");
		}

		var user = await userService.GetUserByIdAsync(userId, cancellationToken);

		if (user is null) {
			if (logger.IsEnabled(LogLevel.Error)) {
				logger.LogError("User not found for session: {@Context}", new {
					UserId = authContext.UserId,
					HasSessionToken = authContext.SessionToken is not null,
				});
			}

			return TypedProblems.Unauthorized("Invalid session", ResponseKeys.InvalidSession);
		}

		var result = new GetUserAuthDataResult {
			Id = user.GetRequiredId(),
			Email = user.Email,
			AvatarUrl = user.AvatarUrl,
			FirstName = user.FirstName,
			LastName = user.LastName
		};

		// /auth/user-auth-data sits behind session auth only, so there is no
		// X-Tenant-Id auth context here — the caller scopes the request with
		// ?tenant_id= (the front passes its active workspace id, the same value
		// every authed call sends as X-Tenant-Id).
		if (!Guid.TryParse(tenantId, out var parsedTenantId)) {
			// Unscoped or malformed scope: gate everything closed (empty array,
			// never null).
			result.TenantPermissionKeys = [];
		} else {
			// Resolve the SAME tenant account TenantPermissionFilter reads off
			// IRequestAuthContext.AccountTenant — that filter runs behind
			// TenantAuthFilter, this endpoint does not, so the handler resolves
			// the account itself.
			var account = await accountService.GetUserTenantAccountAsync(
				userId,
				parsedTenantId,
				cancellationToken
			);

			if (account is null || account.Status == AccountStatus.Suspended) {
				result.TenantPermissionKeys = [];
			} else if (account.Level == AccountLevel.Admin) {
				// Effective set: mirror TenantPermissionFilter's #861 Admin
				// short-circuit.
				result.TenantPermissionKeys = ["*"];
			} else {
				// Two-parameter signature — GetTenantPermissionsAsync takes NO
				// cancellation token (matches TenantPermissionFilter's call).
				var permissionKeys = await permissionService.GetTenantPermissionsAsync(
					userId,
					parsedTenantId
				);
				result.TenantPermissionKeys = [.. permissionKeys];
			}
		}

		return TypedResults.Ok(result);
	}
}
