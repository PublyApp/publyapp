using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Validation;
using MainApi.Src.Modules.Tenants.Entities;
using MainApi.Src.Modules.Tenants.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Tenants.Handlers.Staff;

public class TenantAsStaffItem {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
	public string? LogoUrl { get; set; }
	public int UsersCount { get; set; }
	public int MaxUsers { get; set; }
	public string Status { get; set; } = string.Empty;
	public bool IsSuspended { get; set; }
}

public class TenantAsStaffResult {
	public required List<TenantAsStaffItem> Tenants { get; set; }
	public required int Count { get; set; }
}

public class FindTenantsAsStaffQuery : PaginatedQuery { }

public class FindTenantsAsStaffQueryValidator : PaginatedQueryValidator<FindTenantsAsStaffQuery> { }

public class FindTenantsAsStaff {
	public static async Task<Results<Ok<TenantAsStaffResult>, AppBadRequestHttpResult>>
	HandleFindTenantsAsStaff(
		[AsParameters] FindTenantsAsStaffQuery findTenantsAsStaffQuery,
		[FromServices] ITenantAsStaffService tenantAsStaffService,
		CancellationToken cancellationToken
	) {
		var page = findTenantsAsStaffQuery.GetPage();
		var limit = findTenantsAsStaffQuery.GetLimit();
		var sortId = findTenantsAsStaffQuery.GetSortId();
		var sortOrder = findTenantsAsStaffQuery.GetSortOrder();

		var count = await tenantAsStaffService.CountTenantsAsync(cancellationToken);

		var tenants = await tenantAsStaffService.FindTenantsAsync(
			page: page,
			limit: limit,
			sortId: sortId,
			sortOrder: sortOrder,
			cancellationToken: cancellationToken
		);

		return TypedResults.Ok(new TenantAsStaffResult {
			Tenants = tenants
				.Select(tenant => new TenantAsStaffItem {
					Id = tenant.Tenant.GetRequiredId(),
					Name = tenant.Tenant.Name,
					LogoUrl = tenant.Tenant.LogoUrl,
					UsersCount = tenant.UsersCount,
					MaxUsers = tenant.Tenant.MaxUsers,
					Status = Tenant.GetStatusDescription(tenant.Tenant.Status),
					IsSuspended = tenant.Tenant.IsSuspended,
				})
				.ToList(),
			Count = count,
		});
	}
}
