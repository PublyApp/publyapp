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

		await LogBulkActionAsync(
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

	private static Task LogBulkActionAsync(
		IAuditLogService auditLogService,
		IRequestAuthContext authContext,
		string action,
		Guid tenantUserId,
		IReadOnlyCollection<Guid> tenantIds,
		TenantUserCompanyBulkActionResult result,
		CancellationToken cancellationToken
	) {
		return TenantUserCompanyBulkActionLogger.LogAsync(
			auditLogService,
			authContext,
			action,
			tenantUserId,
			tenantIds,
			result,
			cancellationToken
		);
	}
}

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

		await TenantUserCompanyBulkActionLogger.LogAsync(
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

public sealed class BulkSuspendTenantUserCompaniesForStaff {
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
		var result = await userService.BulkSuspendTenantUserCompaniesForStaffAsync(
			new TenantUserCompanyIdsArgs(
				UserId: userIdGuid,
				TenantIds: tenantIds
			),
			cancellationToken
		);

		await TenantUserCompanyBulkActionLogger.LogAsync(
			auditLogService,
			authContext,
			AuditActions.TenantUserCompaniesBulkSuspended,
			userIdGuid,
			tenantIds,
			result,
			cancellationToken
		);

		return TypedResults.Ok(result);
	}
}

public sealed class BulkReactivateTenantUserCompaniesForStaff {
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
		var result = await userService.BulkReactivateTenantUserCompaniesForStaffAsync(
			new TenantUserCompanyIdsArgs(
				UserId: userIdGuid,
				TenantIds: tenantIds
			),
			cancellationToken
		);

		await TenantUserCompanyBulkActionLogger.LogAsync(
			auditLogService,
			authContext,
			AuditActions.TenantUserCompaniesBulkReactivated,
			userIdGuid,
			tenantIds,
			result,
			cancellationToken
		);

		return TypedResults.Ok(result);
	}
}

file static class TenantUserCompanyBulkActionLogger {
	public static async Task LogAsync(
		IAuditLogService auditLogService,
		IRequestAuthContext authContext,
		string action,
		Guid tenantUserId,
		IReadOnlyCollection<Guid> tenantIds,
		TenantUserCompanyBulkActionResult result,
		CancellationToken cancellationToken
	) {
		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
		}

		var requestedTenantIds = tenantIds.Distinct().ToList();
		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: action,
				TargetId: tenantUserId,
				Details: new {
					TenantUserId = tenantUserId,
					RequestedCount = requestedTenantIds.Count,
					SucceededCount = result.SucceededCount,
					FailedCount = result.FailedCount,
					RequestedTenantIds = requestedTenantIds,
					FailedItems = result.FailedItems,
					PerformedByUserId = account.UserId
				}
			),
			cancellationToken
		);
	}
}
