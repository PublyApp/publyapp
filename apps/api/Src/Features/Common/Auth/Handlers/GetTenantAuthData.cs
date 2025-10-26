using MainApi.Localization;
using MainApi.Src.Features.Common.Account;
using MainApi.Src.Features.Common.Profile;
using MainApi.Src.Features.Common.Tenant;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Middlewares;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace MainApi.Src.Features.Common.Auth.Handlers;

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
	}

	public class Staff {
		public string Code { get; set; } = "staff";
		public List<ProfileItem> Profiles { get; set; } = [];
	}
}

public class GetTenantAuthData {
	public static async Task<
		Results<
			Ok<GetTenantAuthDataResult.Staff>,
			Ok<GetTenantAuthDataResult.Tenant>,
			BadRequest<ApiResponse>
			>
		> HandleGetTenantAuthData(
		IAuthContext authContext,
		ILogger<GetTenantAuthData> logger,
		[AsParameters] GetTenantAuthDataQuery query,
		[FromServices] IOptions<AppSettings> appSettings,
		[FromServices] ITenantService tenantService,
		[FromServices] IAccountService accountService,
		[FromServices] IProfileService profileService,
		CancellationToken cancellationToken
	) {
		if (!authContext.IsAuthenticated) {
			logger.LogError("{@GetUserAuthData}", new {
				UserId = authContext.UserId,
				SessionToken = authContext.SessionToken
			});
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
				logger.LogWarning(
					"Attempt to access staff auth data by user who is not a staff member, {@LogData}",
					new {
						UserId = userId,
						TenantId = query.TenantId,
						SessionToken = authContext.SessionToken,
					}
				);

				return TypedResults.BadRequest(ApiResponse.Create(
					"Unauthorized",
					ResponseKeys.Unauthorized
				));
			}

			// Get the user's profiles and permissions for the staff scope
			var staffProfileItems = await profileService.GetStaffProfilesWithPermissionsAsync(
				userId,
				cancellationToken: cancellationToken
			);

			return TypedResults.Ok(
				new GetTenantAuthDataResult.Staff {
					Code = "staff",
					Profiles = staffProfileItems
				}
			);
		}

		var tenantId = query.GetTenantId();

		if (tenantId == Guid.Empty) {
			return TypedResults.BadRequest(ApiResponse.Create(
				"Tenant not found",
				ResponseKeys.NotFound
			));
		}

		var tenant = await tenantService.GetTenantAsync(tenantId, cancellationToken);

		if (tenant is null) {
			return TypedResults.BadRequest(ApiResponse.Create(
				"Tenant not found",
				ResponseKeys.NotFound
			));
		}

		var isUserMemberOfTenant = await accountService.IsUserMemberOfTenantAsync(userId, tenantId, cancellationToken);

		if (!isUserMemberOfTenant) {
			logger.LogWarning(
				"Attempt to access tenant auth data by user who is not a member of the tenant, {@LogData}",
				new {
					UserId = userId,
					TenantId = tenantId,
					SessionToken = authContext.SessionToken,
				}
			);

			return TypedResults.BadRequest(ApiResponse.Create(
				"Unauthorized",
				ResponseKeys.Unauthorized
			));
		}

		var tenantProfileItems = await profileService.GetUserProfilesWithPermissionsForTenantAsync(
			userId,
			tenantId,
			appSettings.Value.MAX_PROFILES_PER_USER,
			cancellationToken
		);

		return TypedResults.Ok(
			new GetTenantAuthDataResult.Tenant {
				Id = tenantId,
				Name = tenant.Name,
				Code = tenant.Code,
				Profiles = tenantProfileItems
			}
		);
	}
}
