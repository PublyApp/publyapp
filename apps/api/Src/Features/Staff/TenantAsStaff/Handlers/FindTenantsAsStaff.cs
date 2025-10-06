using MainApi.Src.Lib;
using FluentValidation;
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

public class FindTenantsAsStaffQuery {
	[FromQuery] public string? Page { get; set; }
	[FromQuery] public string? Limit { get; set; }
	[FromQuery] public string? SortId { get; set; }
	[FromQuery] public string? SortOrder { get; set; }

	public int? GetPage() {
		if (Page is null) {
			return null;
		}

		if (!int.TryParse(Page, out var page)) {
			throw new Exception("Page must be a valid number");
		}

		return page;
	}

	public int? GetLimit() {
		if (Limit is null) {
			return null;
		}

		if (!int.TryParse(Limit, out var limit)) {
			throw new Exception("Limit must be a valid number");
		}

		return limit;
	}

	public string? GetSortId() {
		if (SortId is null) {
			return null;
		}
		return SortId;
	}

	public Lib.SortOrder GetSortOrder() {
		if (SortOrder is null) {
			return Lib.SortOrder.Desc;
		}

		if (
			!SortOrder.Equals("asc", StringComparison.OrdinalIgnoreCase)
			&& !SortOrder.Equals("desc", StringComparison.OrdinalIgnoreCase)
		) {
			throw new Exception("SortOrder must equal 'asc' or 'desc'");
		}

		return SortOrder == "asc"
			? Lib.SortOrder.Asc
			: Lib.SortOrder.Desc;
	}
}

public class FindTenantsAsStaffQueryValidator : AbstractValidator<FindTenantsAsStaffQuery> {
	public FindTenantsAsStaffQueryValidator() {
		RuleFor(x => x.Page)
			.Must(BeValidNullableNumber)
			.WithMessage("Page must be a valid number greater than or equal to 1");

		RuleFor(x => x.Limit)
			.Must(BeValidNullableNumber)
			.WithMessage("Limit must be a valid number greater than or equal to 1");

		RuleFor(x => x.SortId)
			.Must(BeValidNullableString)
			.WithMessage("SortId must be a valid string");

		RuleFor(x => x.SortOrder)
			.Must(BeValidNullableSort)
			.WithMessage("SortOrder must equal 'asc' or 'desc'");
	}

	private static bool BeValidNullableString(string? value) {
		if (value is null) {
			return true;
		}

		return !string.IsNullOrEmpty(value);
	}

	private static bool BeValidNullableSort(string? value) {
		if (value is null) {
			return true;
		}

		return (
			value.Equals("asc", StringComparison.OrdinalIgnoreCase)
			|| value.Equals("desc", StringComparison.OrdinalIgnoreCase)
		);
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
