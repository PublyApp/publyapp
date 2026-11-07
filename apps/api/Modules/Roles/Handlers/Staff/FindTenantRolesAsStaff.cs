using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Roles.Services;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public class FindTenantRolesAsStaffResult : CursorPaginatedResult<TenantRoleItem> { }

public class FindTenantRolesAsStaffQuery : CursorPaginatedQuery {
	[FromQuery(Name = "q")]
	public string? Search { get; set; }

	[FromQuery(Name = "is_default")]
	public string? IsDefault { get; set; }

	public string? GetSearchNormalized() {
		if (this.Search is null) {
			return null;
		}

		var trimmed = this.Search.Trim();
		return trimmed.Length == 0 ? null : trimmed;
	}

	public bool? GetIsDefault() {
		return QueryPredicates.ParseNullableBoolean(this.IsDefault);
	}
}

public class FindTenantRolesAsStaffQueryValidator
	: CursorPaginatedQueryValidator<FindTenantRolesAsStaffQuery> {
	public FindTenantRolesAsStaffQueryValidator() {
		this.RuleFor(x => x.Search).MaximumLength(200);

		this.RuleFor(x => x.IsDefault)
			.Must(QueryPredicates.BeValidNullableBoolean)
			.WithMessage("is_default must be 'true' or 'false'");
	}
}

public sealed class FindTenantRolesAsStaff {
	public static async Task<
		Results<
			Ok<FindTenantRolesAsStaffResult>,
			AppBadRequestHttpResult
		>
	> Handle(
		[FromRoute] string tenantId,
		[AsParameters] FindTenantRolesAsStaffQuery findTenantRolesAsStaffQuery,
		[FromServices] ITenantRoleQueryAsStaffService tenantRoleService,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest("Invalid tenant ID", ResponseKeys.MalformedId);
		}

		var cursor = findTenantRolesAsStaffQuery.GetCursor();
		var cursorGuid = Guid.Empty;

		if (!string.IsNullOrEmpty(cursor)) {
			if (!Guid.TryParse(cursor, out cursorGuid)) {
				return TypedProblems.BadRequest("Invalid cursor", ResponseKeys.BadRequest);
			}
		}

		var limit = findTenantRolesAsStaffQuery.GetLimit();
		var sortId = findTenantRolesAsStaffQuery.GetSortId();
		var sortOrder = findTenantRolesAsStaffQuery.GetSortOrder();

		var args = new FindTenantRolesArgs(
			TenantId: tenantIdGuid,
			Cursor: cursorGuid,
			Limit: limit,
			SortId: sortId,
			SortOrder: sortOrder,
			Search: findTenantRolesAsStaffQuery.GetSearchNormalized(),
			IsDefault: findTenantRolesAsStaffQuery.GetIsDefault()
		);

		var serviceResult = await tenantRoleService.FindTenantRolesAsync(
			args,
			cancellationToken: cancellationToken
		);

		if (serviceResult is Services.FindTenantRolesResult.CursorNotFound cursorError) {
			return TypedProblems.BadRequest(
				$"Cursor record not found: {cursorError.Cursor}. The record may have been deleted or the cursor is invalid.",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is Services.FindTenantRolesResult.InvalidSortId sortIdError) {
			return TypedProblems.BadRequest(
				$"Invalid sort_id: {sortIdError.SortId}. Allowed values: id, name, created_at",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is Services.FindTenantRolesResult.Success success) {
			return TypedResults.Ok(new FindTenantRolesAsStaffResult {
				Data = success.Data.Data,
				NextCursor = success.Data.NextCursor,
			});
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
