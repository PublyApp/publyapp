using FluentValidation;
using MainApi.Localization;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Features.Staff.Tenant.Handlers;

public class GetTenantAsStaffQuery {
	public string TenantId { get; set; } = string.Empty;

	public Guid GetTenantId() {
		return Guid.TryParse(TenantId, out var tenantId) ? tenantId : Guid.Empty;
	}
}

public class GetTenantAsStaffResult {
	public Guid TenantId { get; set; }
	public string Name { get; set; } = string.Empty;
}

public class GetTenantAsStaffQueryValidator : AbstractValidator<GetTenantAsStaffQuery> {
	public GetTenantAsStaffQueryValidator() {
		RuleFor(x => x.TenantId)
			.NotEmpty().WithMessage("TenantId is required");
	}
}

public class GetTenantAsStaff {
	public static async Task<
		Results<
			Ok<GetTenantAsStaffResult>,
			BadRequest<ApiResponse>
		>
	> HandleGetTenantAsStaff(
		[FromServices] IStaffTenantService staffTenantService,
		[FromRoute] string tenantId,
		CancellationToken cancellationToken
	) {

		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedResults.BadRequest(ApiResponse.Create(
				"Tenant not found",
				ResponseKeys.NotFound
			));
		}

		var tenant = await staffTenantService.GetTenantAsync(tenantIdGuid, cancellationToken);

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
