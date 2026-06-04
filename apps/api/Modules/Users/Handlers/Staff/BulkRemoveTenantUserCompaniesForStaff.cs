using System.ComponentModel.DataAnnotations;
using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public class TenantUserCompanyIdsForStaffBody {
	[Required]
	public JsonElement TenantIds { get; init; }

	public List<Guid> GetTenantIds() {
		var tenantIds = new List<Guid>();

		foreach (var tenantIdElement in TenantIds.EnumerateArray()) {
			tenantIds.Add(tenantIdElement.GetValueAsGuid());
		}

		return tenantIds;
	}
}

public sealed class TenantUserCompanyIdsForStaffBodyValidator
	: AbstractValidator<TenantUserCompanyIdsForStaffBody> {
	public TenantUserCompanyIdsForStaffBodyValidator() {
		// Bulk actions are intentionally bounded even though the UI submits the
		// current table selection; this endpoint should not become an unbounded
		// assignment/removal surface.
		RuleFor(x => x.TenantIds)
			.MustBeRequiredGuidArray(
				fieldName: "tenantIds",
				itemName: "tenantId",
				maxCount: 100
			);
	}
}

/// <summary>
/// Removes one or more company memberships from a tenant user as a staff admin.
/// </summary>
public sealed class BulkRemoveTenantUserCompaniesForStaff {
	public static async Task<Results<
		Ok<TenantUserCompanyBulkActionResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string userId,
		[FromBody] TenantUserCompanyIdsForStaffBody body,
		[FromServices] IUserService userService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(userId, out var userIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid userId",
				ResponseKeys.MalformedId
			);
		}

		var tenantUser = await userService.GetTenantUserDetailsForStaffAsync(
			userIdGuid,
			cancellationToken
		);
		if (tenantUser is null) {
			return TypedProblems.NotFound(
				"Tenant user not found",
				ResponseKeys.NotFound
			);
		}

		var tenantIds = body.GetTenantIds();
		var result = await userService.BulkRemoveTenantUserCompaniesForStaffAsync(
			new TenantUserCompanyIdsArgs(
				UserId: userIdGuid,
				TenantIds: tenantIds
			),
			cancellationToken
		);

		await TenantUserCompanyShared.LogBulkActionAsync(
			auditLogService,
			authContext,
			AuditActions.TenantUserCompaniesBulkRemoved,
			userIdGuid,
			tenantIds,
			result,
			cancellationToken
		);

		return TypedResults.Ok(result);
	}
}
