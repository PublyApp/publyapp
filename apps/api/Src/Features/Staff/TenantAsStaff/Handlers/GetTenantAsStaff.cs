using MainApi.Src.Lib;
using MainApi.Localization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http.HttpResults;

namespace MainApi.Src.Features.Staff.TenantAsStaff.Handlers;
public class GetTenantAsStaffResult {
	public Guid TenantId { get; set; }
	public string Name { get; set; } = string.Empty;
}

public class GetTenantAsStaff {
	public static async Task<
		Results<
			Ok<GetTenantAsStaffResult>,
			BadRequest<ApiResponse>
		>
	> HandleGetTenantAsStaff(
		[FromServices] ITenantAsStaffService tenantAsStaffService,
		[FromRoute] string tenantId,
		CancellationToken cancellationToken
	) {

		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedResults.BadRequest(ApiResponse.Create(
				"Tenant not found",
				ResponseKeys.NotFound
			));
		}

		var tenant = await tenantAsStaffService.GetTenantAsync(tenantIdGuid, cancellationToken);

		if (tenant is null) {
			return TypedResults.BadRequest(ApiResponse.Create(
				"Tenant not found",
				ResponseKeys.NotFound
			));
		}

		return TypedResults.Ok(new GetTenantAsStaffResult {
			TenantId = tenant.Id,
			Name = tenant.Name,
		});
	}
}
