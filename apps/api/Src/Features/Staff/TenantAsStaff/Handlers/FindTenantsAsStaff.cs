using MainApi.Src.Lib;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http.HttpResults;

namespace MainApi.Src.Features.Staff.TenantAsStaff.Handlers;

public class TenantAsStaffItem {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
}

public class TenantAsStaffResult {
	public required List<TenantAsStaffItem> Tenants { get; set; }
	public required int Count { get; set; }
}

public class FindTenantsAsStaffQuery : PaginatedQuery { }

public class FindTenantsAsStaffQueryValidator : PaginatedQueryValidator<FindTenantsAsStaffQuery> { }

public class FindTenantsAsStaff {
	public static async Task<Results<Ok<TenantAsStaffResult>, BadRequest<ApiResponse>>> HandleFindTenantsAsStaff(
		[AsParameters] FindTenantsAsStaffQuery findTenantsAsStaffQuery,
		[FromServices] ITenantAsStaffService tenantAsStaffService,
		CancellationToken cancellationToken
	) {
		var page = findTenantsAsStaffQuery.GetPage();
		var limit = findTenantsAsStaffQuery.GetLimit();
		var sortId = findTenantsAsStaffQuery.GetSortId();
		var sortOrder = findTenantsAsStaffQuery.GetSortOrder();

		var countTask = tenantAsStaffService.CountTenantsAsync(cancellationToken);

		var tenantsTask = tenantAsStaffService.FindTenantsAsync(
			page: page,
			limit: limit,
			sortId: sortId,
			sortOrder: sortOrder,
			cancellationToken: cancellationToken
		);

		await Task.WhenAll(countTask, tenantsTask).ConfigureAwait(false);

		var tenants = tenantsTask.Result;
		var count = countTask.Result;

		return TypedResults.Ok(new TenantAsStaffResult {
			Tenants = tenants
				.Select(tenant => new TenantAsStaffItem {
					Id = tenant.Id,
					Name = tenant.Name,
				})
				.ToList(),
			Count = count,
		});
	}
}
