using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Middlewares;
using MainApi.Src.Modules.Shared.Profiles;
using MainApi.Src.Modules.Shared.Tenants;
using MainApi.Src.Modules.Shared.Users;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace MainApi.Src.Modules.Shared.Auth.Handlers;

public class GetTenantAuthDataQuery {
	public string TenantId { get; set; } = string.Empty;

	public Guid GetTenantId() {
		return Guid.TryParse(TenantId, out var tenantId) ? tenantId : Guid.Empty;
	}
}

public class GetTenantAuthDataResult {
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

public class GetTenantAuthData {
	public static async Task<
		Results<
			Ok<GetTenantAuthDataResult.Staff>,
			Ok<GetTenantAuthDataResult.Tenant>,
			BadRequest<ApiResponse>,
			JsonHttpResult<ApiResponse>
		>
	> HandleGetTenantAuthData(
		IRequestAuthContext authContext,
		ILogger<GetTenantAuthData> logger,
		[AsParameters] GetTenantAuthDataQuery query,
		[FromServices] IOptions<AppSettings> appSettings,
		[FromServices] ITenantService tenantService,
		[FromServices] IAccountService accountService,
		[FromServices] IProfileService profileService,
		CancellationToken cancellationToken
	) {
		if (!authContext.IsAuthenticated) {
			if (logger.IsEnabled(LogLevel.Error)) {
				logger.LogError("{@GetUserAuthData}", new {
					UserId = authContext.UserId,
					SessionToken = authContext.SessionToken
				});
			}
			throw new Exception($"{nameof(GetTenantAuthData)} must be set behind {nameof(SessionAuthMiddleware)}.");
		}

		if (authContext.UserId is not Guid userId) {
			throw new Exception($"{nameof(authContext.UserId)} is not a GUID");
		}

		if (string.Equals(
			query.TenantId,
			"staff",
			StringComparison.Ordinal
		)) {
			var isUserStaffMember = await accountService.IsUserStaffMemberAsync(userId, cancellationToken);

			if (!isUserStaffMember) {
				if (logger.IsEnabled(LogLevel.Warning)) {
					logger.LogWarning(
						"Attempt to access staff auth data by user who is not a staff member, {@LogData}",
						new {
							UserId = userId,
							TenantId = query.TenantId,
							SessionToken = authContext.SessionToken,
						}
					);
				}

				return TypedResults.Json(ApiResponse.Create(
					"Unauthorized",
					ResponseKeys.Unauthorized
				), statusCode: StatusCodes.Status403Forbidden);
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
				new GetTenantAuthDataResult.Staff {
					Code = "staff",
					Profiles = staffProfileItems,
					AccountLevel = UserAccount.GetAccountLevelDescription(staffAccount?.Level ?? AccountLevel.User),
					IsAdmin = staffAccount?.Level == AccountLevel.Admin,
					Permissions = staffPermissions
				}
			);
		}

		var tenantId = query.GetTenantId();

		if (tenantId == Guid.Empty) {
			return TypedResults.Json(ApiResponse.Create(
				"Tenant not found",
				ResponseKeys.NotFound
			), statusCode: StatusCodes.Status404NotFound);
		}

		var tenant = await tenantService.GetTenantByIdAsync(tenantId, cancellationToken);

		if (tenant is null) {
			return TypedResults.Json(ApiResponse.Create(
				"Tenant not found",
				ResponseKeys.NotFound
			), statusCode: StatusCodes.Status404NotFound);
		}

		var isUserMemberOfTenant = await accountService.IsUserMemberOfTenantAsync(userId, tenantId, cancellationToken);

		if (!isUserMemberOfTenant) {
			if (logger.IsEnabled(LogLevel.Warning)) {
				logger.LogWarning(
					"Attempt to access tenant auth data by user who is not a member of the tenant, {@LogData}",
					new {
						UserId = userId,
						TenantId = tenantId,
						SessionToken = authContext.SessionToken,
					}
				);
			}

			return TypedResults.Json(ApiResponse.Create(
				"Unauthorized",
				ResponseKeys.Unauthorized
			), statusCode: StatusCodes.Status403Forbidden);
		}

		// Get user's tenant account for level info
		var tenantAccount = await accountService.GetUserTenantAccountAsync(userId, tenantId, cancellationToken);

		var tenantProfileItems = await profileService.GetUserProfilesWithPermissionsForTenantAsync(
			userId,
			tenantId,
			appSettings.Value.MAX_PROFILES_PER_USER,
			cancellationToken
		);

		// Flatten permissions from all profiles
		var tenantPermissions = tenantProfileItems
			.SelectMany(p => p.Permissions)
			.Distinct()
			.ToList();

		return TypedResults.Ok(
			new GetTenantAuthDataResult.Tenant {
				Id = tenantId,
				Name = tenant.Name,
				Code = tenant.Code,
				Profiles = tenantProfileItems,
				AccountLevel = UserAccount.GetAccountLevelDescription(tenantAccount?.Level ?? AccountLevel.User),
				IsAdmin = tenantAccount?.Level == AccountLevel.Admin,
				Permissions = tenantPermissions
			}
		);
	}
}
