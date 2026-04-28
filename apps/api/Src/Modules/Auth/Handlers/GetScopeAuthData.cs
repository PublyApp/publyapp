using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Profiles.Services;
using MainApi.Src.Modules.Tenants.Services;
using MainApi.Src.Modules.Users.Entities;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Auth.Handlers;

public class GetScopeAuthDataQuery {
	[FromQuery(Name = "scope")]
	public string Scope { get; set; } = string.Empty;

	public bool IsStaffScope() {
		return string.Equals(Scope, "staff", StringComparison.Ordinal);
	}

	public Guid GetTenantScopeId() {
		return Guid.TryParse(
			Scope, out var tenantId
		)
			? tenantId
			: Guid.Empty;
	}
}

public class GetScopeAuthDataQueryValidator
	: AbstractValidator<GetScopeAuthDataQuery> {
	public GetScopeAuthDataQueryValidator() {
		// Scope validation is handled in the handler because "staff" and tenant GUIDs share
		// one endpoint contract and we still want membership failures to return 403.
		// We allow empty string here so handler can return security-appropriate 403
		// instead of 422 (which would leak whether the scope format is valid).
		// This preserves the security pattern: don't tell clients which tenant scopes exist.
	}
}

public class GetScopeAuthDataResult {
	public class Tenant {
		public Guid Id { get; set; }
		public string Name { get; set; } = string.Empty;
		public string Code { get; set; } = string.Empty;
		public List<ProfileItem> Profiles { get; set; } = [];
		public string AccountLevel { get; set; } = string.Empty;
		public bool IsAdmin { get; set; } = false;
		public List<string> Permissions { get; set; } = [];
	}

	public class Staff {
		public string Code { get; set; } = "staff";
		public List<ProfileItem> Profiles { get; set; } = [];
		public string AccountLevel { get; set; } = string.Empty;
		public bool IsAdmin { get; set; } = false;
		public List<string> Permissions { get; set; } = [];
	}
}

public class GetScopeAuthData {
	public static async Task<
		Results<
			Ok<GetScopeAuthDataResult.Staff>,
			Ok<GetScopeAuthDataResult.Tenant>,
			AppForbiddenHttpResult
		>
	> HandleGetScopeAuthData(
		IRequestAuthContext authContext,
		ILogger<GetScopeAuthData> logger,
		[AsParameters] GetScopeAuthDataQuery query,
		[FromServices] ITenantService tenantService,
		[FromServices] IAccountService accountService,
		[FromServices] IProfileService profileService,
		CancellationToken cancellationToken
	) {
		if (!authContext.IsAuthenticated) {
			if (logger.IsEnabled(LogLevel.Error)) {
				logger.LogError("{@GetScopeAuthData}", new {
					UserId = authContext.UserId,
					HasSessionToken = authContext.SessionToken is not null
				});
			}
			throw new Exception($"GetScopeAuthData must be set behind SessionAuthFilter.");
		}

		if (authContext.UserId is not Guid userId) {
			throw new Exception($"{nameof(authContext.UserId)} is not a GUID");
		}

		if (query.IsStaffScope()) {
			// Staff scope reuses this payload shape with a reserved scope identifier.
			var isUserStaffUser = await accountService.IsUserStaffUserAsync(userId, cancellationToken);

			if (!isUserStaffUser) {
				if (logger.IsEnabled(LogLevel.Warning)) {
					logger.LogWarning(
						"Attempt to access staff auth data by user who is not a staff member, {@LogData}",
						new {
							UserId = userId,
							Scope = query.Scope,
						}
					);
				}

				return TypedProblems.Forbidden("User is not a staff member", ResponseKeys.NotAStaffUser);
			}

			// Get the user's staff account for level info
			var staffAccount = await accountService.GetUserStaffAccountAsync(userId, cancellationToken);

			// Get the user's profiles and permissions for the staff scope
			var staffProfileItems = await profileService.GetStaffProfilesWithPermissionsAsync(
				userId,
				cancellationToken: cancellationToken
			);

			// Flatten permissions from all profiles
			var staffPermissions = staffProfileItems
				.SelectMany(p => p.Permissions)
				.Distinct()
				.ToList();

			return TypedResults.Ok(
				new GetScopeAuthDataResult.Staff {
					Code = "staff",
					Profiles = staffProfileItems,
					AccountLevel = UserAccount.GetLevelDescription(staffAccount?.Level ?? AccountLevel.User),
					IsAdmin = staffAccount?.Level == AccountLevel.Admin,
					Permissions = staffPermissions
				}
			);
		}

		var tenantId = query.GetTenantScopeId();

		if (tenantId == Guid.Empty) {
			// Invalid tenant ID format - give generic 403 (don't reveal if tenant exists)
			return TypedProblems.Forbidden(
				"User does not have access to this tenant",
				ResponseKeys.Forbidden
			);
		}

		// SECURITY (D9): Check membership FIRST - before revealing any tenant info
		// This prevents attackers from probing tenant IDs (they always get 403, never 404)
		var tenantAccount = await accountService.GetUserTenantAccountAsync(
			userId,
			tenantId,
			cancellationToken
		);

		if (tenantAccount is null) {
			// User is not a member - give generic 403 (don't reveal if tenant exists)
			if (logger.IsEnabled(LogLevel.Warning)) {
				logger.LogWarning(
					"Attempt to access tenant auth data by user who is not a member, {@LogData}",
					new {
						UserId = userId,
						Scope = query.Scope,
					}
				);
			}

			return TypedProblems.Forbidden(
				"User does not have access to this tenant",
				ResponseKeys.Forbidden
			);
		}

		// User IS a member - now safe to load tenant details
		var tenant = await tenantService.GetTenantByIdIncludingSuspendedAsync(
			tenantId,
			cancellationToken
		);

		if (tenant is null) {
			// Tenant was deleted - member loses access
			return TypedProblems.Forbidden(
				"User does not have access to this tenant",
				ResponseKeys.Forbidden
			);
		}

		// Check if tenant is suspended - only members see this specific message
		if (tenant.IsSuspended()) {
			return TypedProblems.Forbidden(
				"This tenant has been suspended",
				ResponseKeys.TenantSuspended
			);
		}

		// Check tenant is in a valid state (Active only at this point)
		if (!tenant.IsActive()) {
			// Pending/non-active tenants - treat as inaccessible
			return TypedProblems.Forbidden(
				"User does not have access to this tenant",
				ResponseKeys.Forbidden
			);
		}

		var tenantProfileItems = await profileService.GetUserProfilesWithPermissionsForTenantAsync(
			userId,
			tenantId,
			cancellationToken
		);

		// This read must reflect the full effective permission set. Do not apply the write-side
		// max-profiles cap here or auth data can silently omit valid permissions.
		var tenantPermissions = tenantProfileItems
			.SelectMany(profile => profile.Permissions)
			.Distinct()
			.ToList();

		return TypedResults.Ok(
			new GetScopeAuthDataResult.Tenant {
				Id = tenantId,
				Name = tenant.Name,
				Code = tenant.Code,
				Profiles = tenantProfileItems,
				AccountLevel = UserAccount.GetLevelDescription(tenantAccount?.Level ?? AccountLevel.User),
				IsAdmin = tenantAccount?.Level == AccountLevel.Admin,
				Permissions = tenantPermissions
			}
		);
	}
}
