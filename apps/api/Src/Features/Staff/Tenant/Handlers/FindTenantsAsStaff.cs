using FluentValidation;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Features.Staff.Tenant.Handlers;

public class TenantAsStaffItem {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
}

public class TenantAsStaffResult {
	public required List<TenantAsStaffItem> Tenants { get; set; }
	public required int Count { get; set; }
}

public class FindTenantsAsStaffQuery {
	[FromQuery] public string? Page { get; set; }
	[FromQuery] public string? PageSize { get; set; }

	public int? GetPage() {
		if (Page is null) {
			return null;
		}

		if (!int.TryParse(Page, out var page)) {
			throw new Exception("Page must be a valid number");
		}
		return page;
	}

	public int? GetPageSize() {
		if (PageSize is null) {
			return null;
		}

		if (!int.TryParse(PageSize, out var pageSize)) {
			throw new Exception("PageSize must be a valid number");
		}
		return pageSize;
	}
}

public class FindTenantsAsStaffQueryValidator : AbstractValidator<FindTenantsAsStaffQuery> {
	public FindTenantsAsStaffQueryValidator() {
		RuleFor(x => x.Page)
			.Must(BeValidNullableNumber)
			.WithMessage("Page must be a valid number greater than or equal to 1");

		RuleFor(x => x.PageSize)
			.Must(BeValidNullableNumber)
			.WithMessage("PageSize must be a valid number greater than or equal to 1");
	}

	private static bool BeValidNullableNumber(string? value) {
		if (value is null) {
			return true;
		}

		return int.TryParse(value, out var num) && num >= 1;
	}
}

public class FindTenantsAsStaff {
	public static async Task<Results<Ok<TenantAsStaffResult>, BadRequest<ApiResponse>>> HandleFindTenantsAsStaff(
		[AsParameters] FindTenantsAsStaffQuery findTenantsAsStaffQuery,
		[FromServices] IStaffTenantService staffTenantService,
		CancellationToken cancellationToken
	) {
		var page = findTenantsAsStaffQuery.GetPage();
		var pageSize = findTenantsAsStaffQuery.GetPageSize();

		var countTask = staffTenantService.CountTenantsAsync(cancellationToken);

		var tenantsTask = staffTenantService.FindTenantsAsync(
			page: page,
			pageSize: pageSize,
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
