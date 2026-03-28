using FluentValidation;

using MainApi.Localization;
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

public class FindTenantsAsStaffQuery : CursorPaginatedQuery {
	[FromQuery(Name = "q")]
	public string? Search { get; set; }

	[FromQuery]
	public string? Status { get; set; }

	public string? GetSearchNormalized() {
		if (Search is null) {
			return null;
		}

		var trimmed = Search.Trim();
		return trimmed.Length == 0 ? null : trimmed;
	}

	public IReadOnlySet<TenantStatus>? GetStatusesOrNull() {
		if (Status is null) {
			return null;
		}

		var trimmed = Status.Trim();
		if (trimmed.Length == 0) {
			return null;
		}

		var parts = trimmed
			.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
		if (parts.Length == 0) {
			return null;
		}

		var statuses = new HashSet<TenantStatus>();
		foreach (var part in parts) {
			TenantStatus? parsed = Tenant.ParseStatus(part);
			if (parsed is { } status) {
				statuses.Add(status);
			}
		}
		return statuses.Count > 0 ? statuses : null;
	}
}

public class FindTenantsAsStaffQueryValidator
	: CursorPaginatedQueryValidator<FindTenantsAsStaffQuery> {

	private static readonly HashSet<string> AllowedStatuses =
		new([nameof(TenantStatus.Pending), nameof(TenantStatus.Active), nameof(TenantStatus.Suspended)], StringComparer.OrdinalIgnoreCase);

	public FindTenantsAsStaffQueryValidator() {
		RuleFor(x => x.Search).MaximumLength(200);

		RuleFor(x => x.Status)
			.Must(raw => {
				if (string.IsNullOrEmpty(raw)) {
					return true;
				}

				var parts = raw
					.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
				return parts.All(p => AllowedStatuses.Contains(p));
			})
			.WithMessage("Invalid status value. Must be comma-separated: " + string.Join(",", AllowedStatuses));
	}
}

public class FindTenantsAsStaffResponse : CursorPaginatedResult<TenantAsStaffListItem> { }

public class FindTenantsAsStaff {
	public static async Task<Results<Ok<FindTenantsAsStaffResponse>, AppBadRequestHttpResult>>
	HandleFindTenantsAsStaff(
		[AsParameters] FindTenantsAsStaffQuery findTenantsAsStaffQuery,
		[FromServices] ITenantAsStaffService tenantAsStaffService,
		CancellationToken cancellationToken
	) {
		// Parse cursor - Guid.Empty means first page
		var cursorStr = findTenantsAsStaffQuery.GetCursor();
		var cursorGuid = Guid.Empty;

		if (!string.IsNullOrEmpty(cursorStr)) {
			if (!Guid.TryParse(cursorStr, out cursorGuid)) {
				return TypedProblems.BadRequest("Invalid cursor format", ResponseKeys.BadRequest);
			}
		}

		var limit = findTenantsAsStaffQuery.GetLimit();
		var sortId = findTenantsAsStaffQuery.GetSortId();
		var sortOrder = findTenantsAsStaffQuery.GetSortOrder();

		var args = new FindTenantsAsStaffArgs(
			Cursor: cursorGuid,
			Limit: limit,
			SortId: sortId,
			SortOrder: sortOrder,
			Filters: new FindTenantsAsStaffFilters(
				Search: findTenantsAsStaffQuery.GetSearchNormalized(),
				Status: findTenantsAsStaffQuery.GetStatusesOrNull()
			)
		);

		var result = await tenantAsStaffService.FindTenantsAsStaffAsync(
			args: args,
			cancellationToken: cancellationToken
		);

		// Pattern matching for discriminated union
		if (result is FindTenantsAsStaffServiceResult.CursorNotFound cursorError) {
			return TypedProblems.BadRequest(
				$"Cursor record not found: {cursorError.Cursor}",
				ResponseKeys.BadRequest
			);
		}

		if (result is FindTenantsAsStaffServiceResult.InvalidSortId sortIdError) {
			return TypedProblems.BadRequest(
				$"Invalid sortId: {sortIdError.SortId}. Allowed: created_at, updated_at, name, status",
				ResponseKeys.BadRequest
			);
		}

		if (result is FindTenantsAsStaffServiceResult.Success success) {
			return TypedResults.Ok(new FindTenantsAsStaffResponse {
				Data = success.Data.Data,
				NextCursor = success.Data.NextCursor,
			});
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
