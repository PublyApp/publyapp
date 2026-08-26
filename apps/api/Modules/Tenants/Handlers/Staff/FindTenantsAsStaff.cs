using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Tenants.Services;

namespace PublyApp.Api.Modules.Tenants.Handlers.Staff;

public class TenantAsStaffItem {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
	public string? LogoUrl { get; set; }
	public int UsersCount { get; set; }
	public int MaxUsers { get; set; }
	public TenantStatus Status { get; set; }
}

public class TenantAsStaffResult {
	public required List<TenantAsStaffItem> Tenants { get; set; }
	public required int Count { get; set; }
}

public class FindTenantsAsStaffQuery : CursorPaginatedQuery {
	[FromQuery(Name = "q")]
	public string? Search { get; set; }

	[FromQuery(Name = "status")]
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

	// Source of truth: nameof() - rename-safe, no hardcoded strings to maintain.
	private static readonly string[] AllowedStatuses = [
		nameof(TenantStatus.Pending),
		nameof(TenantStatus.Active),
		nameof(TenantStatus.Suspended),
	];

	private static readonly HashSet<string> AllowedStatusSet =
		new(AllowedStatuses, StringComparer.OrdinalIgnoreCase);

	// Lowercased once at type init so the validation message matches the wire
	// contract (lowercase tokens). Comparison itself stays case-insensitive via
	// OrdinalIgnoreCase - ToLowerInvariant never runs on the request path.
	private static readonly string AllowedStatusesDisplay =
		string.Join(", ", AllowedStatuses.Select(s => s.ToLowerInvariant()).Order());

	public FindTenantsAsStaffQueryValidator() {
		RuleFor(x => x.Search)
			.MaximumLength(200)
			.WithMessage("q must be at most 200 characters");

		RuleFor(x => x.Status)
			.Must(raw => {
				if (string.IsNullOrEmpty(raw)) {
					return true;
				}

				// Split WITHOUT RemoveEmptyEntries so empty tokens are caught
				// (",", ",,", "a,,b") instead of being silently dropped.
				var parts = raw.Split(',', StringSplitOptions.TrimEntries);
				if (parts.Length == 0) {
					return false;
				}
				return parts.All(p => p.Length > 0 && AllowedStatusSet.Contains(p));
			})
			.WithMessage($"status must be one of: {AllowedStatusesDisplay}");
	}
}

public class FindTenantsAsStaffResponse : CursorPaginatedResult<TenantAsStaffListItem> { }

public sealed class FindTenantsAsStaff {
	public static async Task<Results<Ok<FindTenantsAsStaffResponse>, AppBadRequestHttpResult>>
	Handle(
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

		var serviceResult = await tenantAsStaffService.FindTenantsAsStaffAsync(
			args: args,
			cancellationToken: cancellationToken
		);

		// Pattern matching for discriminated union
		if (serviceResult is FindTenantsAsStaffServiceResult.CursorNotFound cursorError) {
			return TypedProblems.BadRequest(
				$"Cursor record not found: {cursorError.Cursor}",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is FindTenantsAsStaffServiceResult.InvalidSortId sortIdError) {
			return TypedProblems.BadRequest(
				$"Invalid sort_id: {sortIdError.SortId}. Allowed: created_at, updated_at, name, status",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is FindTenantsAsStaffServiceResult.Success success) {
			return TypedResults.Ok(new FindTenantsAsStaffResponse {
				Data = success.Data.Data,
				NextCursor = success.Data.NextCursor,
			});
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
