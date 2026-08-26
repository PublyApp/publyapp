using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Users.Entities;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public class TenantUserCompanyForStaffResult {
	public Guid TenantId { get; set; }
	public string TenantName { get; set; } = string.Empty;
	public string? TenantLogoUrl { get; set; }
	public AccountLevel Level { get; set; }
	public TenantUserStatus Status { get; set; }
	public DateTime CreatedAt { get; set; }
	public DateTime UpdatedAt { get; set; }
}

public class FindTenantUserCompaniesForStaffResult
	: CursorPaginatedResult<TenantUserCompanyForStaffResult> { }

public class FindTenantUserCompaniesForStaffQuery : CursorPaginatedQuery {
	[FromQuery(Name = "q")]
	public string? Search { get; set; }

	public string? GetSearchNormalized() {
		if (string.IsNullOrWhiteSpace(Search)) {
			return null;
		}

		return Search.Trim();
	}
}

public class FindTenantUserCompaniesForStaffQueryValidator
	: CursorPaginatedQueryValidator<
		FindTenantUserCompaniesForStaffQuery
	> {
	public FindTenantUserCompaniesForStaffQueryValidator() {
		RuleFor(x => x.Search)
			.MaximumLength(200);
	}
}

public static class TenantUserCompanyForStaffMapper {
	public static TenantUserCompanyForStaffResult Map(
		TenantUserCompanyData companyData
	) {
		return new TenantUserCompanyForStaffResult {
			TenantId = companyData.Tenant.GetRequiredId(),
			TenantName = companyData.Tenant.Name,
			TenantLogoUrl = companyData.Tenant.LogoUrl,
			Level = companyData.AccountLevel,
			// Expose effective row status: global User suspension overrides an
			// otherwise active tenant membership.
			Status = UserAccount.GetTenantStatus(
				companyData.UserStatus,
				companyData.Account.Status
			),
			CreatedAt = companyData.Account.CreatedAt,
			UpdatedAt = companyData.Account.UpdatedAt,
		};
	}
}

public sealed class FindTenantUserCompaniesForStaff {
	public static async Task<Results<
		Ok<FindTenantUserCompaniesForStaffResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string userId,
		[AsParameters] FindTenantUserCompaniesForStaffQuery query,
		[FromServices] ITenantUserCompanyQueryService companyQueryService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(userId, out var userIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid userId",
				ResponseKeys.MalformedId
			);
		}

		var cursor = query.GetCursor();
		var cursorGuid = Guid.Empty;

		if (!string.IsNullOrEmpty(cursor)) {
			if (!Guid.TryParse(cursor, out cursorGuid)) {
				return TypedProblems.BadRequest(
					"Invalid cursor",
					ResponseKeys.BadRequest
				);
			}
		}

		var args = new FindTenantUserCompaniesForStaffArgs(
			Cursor: cursorGuid,
			Limit: query.GetLimit(),
			SortId: query.GetSortId(),
			SortOrder: query.GetSortOrder(),
			Filters: new FindTenantUserCompaniesForStaffFilters(
				Search: query.GetSearchNormalized()
			)
		);

		var result = await companyQueryService.FindTenantUserCompaniesForStaffAsync(
			userIdGuid,
			args,
			cancellationToken
		);

		if (result is FindTenantUserCompaniesResult.NotFound) {
			return TypedProblems.NotFound(
				"Tenant user not found",
				ResponseKeys.NotFound
			);
		}

		if (
			result
				is FindTenantUserCompaniesResult.CursorNotFound cursorError
		) {
			return TypedProblems.BadRequest(
				$"Cursor record not found: {cursorError.Cursor}.",
				ResponseKeys.BadRequest
			);
		}

		if (
			result
				is FindTenantUserCompaniesResult.InvalidSortId sortIdError
		) {
			return TypedProblems.BadRequest(
				$"Invalid sort_id: {sortIdError.SortId}.",
				ResponseKeys.BadRequest
			);
		}

		if (result is not FindTenantUserCompaniesResult.Success success) {
			throw new InvalidOperationException(
				"Unhandled FindTenantUserCompaniesResult type: "
				+ $"{result.GetType().Name}"
			);
		}

		return TypedResults.Ok(
			new FindTenantUserCompaniesForStaffResult {
				Data = success.Data.Data
					.Select(TenantUserCompanyForStaffMapper.Map)
					.ToList(),
				NextCursor = success.Data.NextCursor,
			}
		);
	}
}
