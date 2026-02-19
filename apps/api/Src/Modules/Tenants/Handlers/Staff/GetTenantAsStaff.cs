using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Tenants.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Tenants.Handlers.Staff;

public class GetTenantAsStaffResult {
	public Guid TenantId { get; set; }
	public string Name { get; set; } = string.Empty;
}

public class GetTenantAsStaff {
	public static async Task<
		Results<
			Ok<GetTenantAsStaffResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult
		>
	> HandleGetTenantAsStaff(
		[FromServices] ITenantAsStaffService tenantAsStaffService,
		[FromRoute] string tenantId,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenant ID",
				ResponseKeys.BadRequest
			);
		}

		var tenant =
			await tenantAsStaffService.GetTenantByIdForStaffAsync(
				tenantIdGuid, cancellationToken
			);

		if (tenant is null) {
			return TypedProblems.NotFound(
				"Tenant not found",
				ResponseKeys.NotFound
			);
		}

		return TypedResults.Ok(new GetTenantAsStaffResult {
			TenantId = tenant.GetRequiredId(),
			Name = tenant.Name,
		});
	}
}
