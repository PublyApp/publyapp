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
using PublyApp.Api.Modules.Users.Entities;
using PublyApp.Api.Modules.Users.Services;
using PublyApp.Api.Modules.Users.Validation;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class AssignTenantUserCompaniesForStaffBody
	: TenantUserCompanyIdsForStaffBody {
	[Required]
	public JsonElement Level { get; init; }

	public AccountLevel GetLevel() {
		var accountLevel = UserAccount.ParseLevel(
			Level.GetValueAsString()
		);
		if (accountLevel is null) {
			throw new InvalidOperationException(
				"Invalid account level after validation."
			);
		}

		return accountLevel.Value;
	}
}

public sealed class AssignTenantUserCompaniesForStaffBodyValidator
	: AbstractValidator<AssignTenantUserCompaniesForStaffBody> {
	public AssignTenantUserCompaniesForStaffBodyValidator() {
		RuleFor(x => x.TenantIds)
			.MustBeRequiredGuidArray(
				fieldName: "tenantIds",
				itemName: "tenantId",
				maxCount: 100
			);

		RuleFor(x => x.Level)
			.MustBeRequiredString("level")
			.MustBeRequiredAccountLevel();
	}
}

/// <summary>
/// Assigns one or more company memberships to a tenant user as a staff admin.
/// </summary>
public sealed class AssignTenantUserCompaniesForStaff {
	public static async Task<Results<
		Ok<TenantUserCompanyBulkActionResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string userId,
		[FromBody] AssignTenantUserCompaniesForStaffBody body,
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
		var result = await userService.AssignTenantUserCompaniesForStaffAsync(
			new AssignTenantUserCompaniesArgs(
				UserId: userIdGuid,
				TenantIds: tenantIds,
				Level: body.GetLevel()
			),
			cancellationToken
		);

		await TenantUserCompanyShared.LogBulkActionAsync(
			auditLogService,
			authContext,
			AuditActions.TenantUserCompaniesAssigned,
			userIdGuid,
			tenantIds,
			result,
			cancellationToken
		);

		return TypedResults.Ok(result);
	}
}
