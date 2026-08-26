using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Tenants.Services;

namespace PublyApp.Api.Modules.AuditLogs.Handlers.Staff;

public class FindTenantActivityForStaffResponse
	: CursorPaginatedResult<AuditLogListItem> { }

// Pagination-only query contract: the surface binds NO scope filters.
// The tenant boundary comes exclusively from the route segment, so a
// caller cannot widen the feed toward another tenant through the
// query string (forged target_id/user_id/actions params are simply
// never bound).
public class FindTenantActivityForStaffQuery : CursorPaginatedQuery { }

public class FindTenantActivityForStaffQueryValidator
	: CursorPaginatedQueryValidator<FindTenantActivityForStaffQuery> { }

/// <summary>
/// Staff read surface for a tenant's activity tab (issue #364).
///
/// READ only by construction: no mutating HTTP verb is routed on this
/// path, so audit entries can never be created, edited, nor deleted
/// from this surface. Scope derivation lives in
/// <see cref="ITenantActivityQueryService"/>; this handler owns route
/// parsing, tenant existence (real 404, not a route miss), and error
/// translation with human-readable causes.
/// </summary>
public sealed class FindTenantActivityForStaff {
	public static async Task<
		Results<
			Ok<FindTenantActivityForStaffResponse>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult
		>
	> Handle(
		[FromRoute] string tenantId,
		[AsParameters]
		FindTenantActivityForStaffQuery query,
		[FromServices] ITenantAsStaffService tenantAsStaffService,
		[FromServices]
			ITenantActivityQueryService tenantActivityQueryService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenant ID",
				ResponseKeys.MalformedId
			);
		}

		// Existence is checked BEFORE listing so an unknown or deleted
		// tenant yields a real semantic 404 instead of an empty page.
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

		var cursor = query.GetCursor();
		var cursorGuid = Guid.Empty;
		if (!string.IsNullOrEmpty(cursor)) {
			if (!Guid.TryParse(cursor, out cursorGuid)) {
				return TypedProblems.BadRequest(
					"Invalid cursor: "
					+ $"{cursor}. "
					+ "The cursor must be the id of the last "
					+ "entry shown on the previous page.",
					ResponseKeys.MalformedId
				);
			}
		}

		var serviceResult =
			await tenantActivityQueryService.FindForTenantAsync(
			new FindTenantActivityArgs(
				TenantId: tenantIdGuid,
				Cursor: cursorGuid,
				Limit: query.GetLimit()
					?? AppEnvironment.Instance
						.PAGINATION_DEFAULT_LIMIT,
				SortId: query.GetSortId() ?? "created_at",
				SortOrder: query.GetSortOrder()
			),
			cancellationToken
		);

		if (serviceResult
			is FindTenantActivityResult.CursorNotFound
				cursorError
		) {
			return TypedProblems.BadRequest(
				"Cursor record not found: "
				+ $"{cursorError.Cursor}. "
				+ "The referenced entry may have been removed, "
				+ "or the cursor belongs to another list.",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult
			is FindTenantActivityResult.InvalidSortId
				sortIdError
		) {
			return TypedProblems.BadRequest(
				"Invalid sort_id: "
				+ $"{sortIdError.SortId}. "
				+ "Allowed values: created_at",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult
			is FindTenantActivityResult.Success success
		) {
			return TypedResults.Ok(
				new FindTenantActivityForStaffResponse {
					Data = success.Data.Data,
					NextCursor =
						success.Data.NextCursor,
				}
			);
		}

		throw new InvalidOperationException(
			"Unhandled result type"
		);
	}
}
