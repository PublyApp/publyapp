using MainApi.Localization;
using MainApi.Src.Features.Common.Tenant;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Middlewares;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace MainApi.Src.Features.Common.Auth.Handlers.GetTenantAuthData;

public class GetTenantAuthDataQuery {
	public string TenantId { get; set; } = string.Empty;

	public Guid GetTenantId() {
		return Guid.TryParse(TenantId, out var tenantId) ? tenantId : Guid.Empty;
	}
}

public class GetTenantAuthDataResult {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
	public string Code { get; set; } = string.Empty;
}

public class GetTenantAuthData {
	public static async Task<
		Results<
			Ok<GetTenantAuthDataResult>,
			BadRequest<ApiResponse>
			>
		> HandleGetTenantAuthData(
		IAuthContext authContext,
		ILogger<GetTenantAuthData> logger,
		[AsParameters] GetTenantAuthDataQuery query,
		[FromServices] IOptions<AppSettings> appSettings,
		[FromServices] ITenantService tenantService,
		CancellationToken cancellationToken = default
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
			appSettings.Value.STAFF_TENANT_CODE,
			StringComparison.Ordinal
		)) {
			var isUserStaffMember = await tenantService.IsUserStaffMemberAsync(userId, cancellationToken);

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

			var staffTenant = await tenantService.GetStaffTenantAsync(cancellationToken);

			if (staffTenant is null) {
				throw new Exception("Staff tenant not found");
			}

			return TypedResults.Ok(
				new GetTenantAuthDataResult {
					Id = staffTenant.Id,
					Name = staffTenant.Name,
					Code = staffTenant.Code
				}
			);
		}

		return TypedResults.Ok(new GetTenantAuthDataResult {
			Id = query.GetTenantId(),
			Name = query.TenantId,
			Code = query.TenantId
		});
	}
}
