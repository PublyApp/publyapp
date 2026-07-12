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

public sealed class BulkRemoveTenantUsersBody {
	[Required]
	public JsonElement UserIds { get; init; }

	public List<Guid> GetUserIds() {
		var userIds = new List<Guid>();
		foreach (var userIdElement in UserIds.EnumerateArray()) {
			userIds.Add(userIdElement.GetValueAsGuid());
		}
		return userIds;
	}
}

public sealed class BulkRemoveTenantUsersBodyValidator
	: AbstractValidator<BulkRemoveTenantUsersBody> {
	public BulkRemoveTenantUsersBodyValidator() {
		// Must stay in sync with shared BULK_ACTION_MAX_COUNT
		RuleFor(x => x.UserIds)
			.MustBeRequiredGuidArray(
				fieldName: "userIds",
				itemName: "userId",
				maxCount: 100
			);
	}
}

public sealed class BulkRemoveTenantUsersAsStaff {
	public static async Task<
		Results<Ok<BulkTenantUserActionResult>, AppBadRequestHttpResult>
	> Handle(
		[FromRoute] string tenantId,
		[FromBody] BulkRemoveTenantUsersBody body,
		[FromServices] ITenantUserMembershipService tenantUserMembershipService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ILogger<BulkRemoveTenantUsersAsStaff> logger,
		CancellationToken cancellationToken = default
	) {
		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. Ensure the endpoint has .WithPermission()."
			);
		}

		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenant ID",
				ResponseKeys.MalformedId
			);
		}

		var distinctUserIds = body.GetUserIds().Distinct().ToList();
		var result = await tenantUserMembershipService.BulkRemoveUsersFromTenantAsync(
			new BulkRemoveUsersFromTenantArgs(
				TenantId: tenantIdGuid,
				UserIds: distinctUserIds
			),
			cancellationToken
		);

		if (logger.IsEnabled(LogLevel.Information)) {
			logger.LogInformation(
				"Bulk remove tenant users completed: {Succeeded} succeeded, {Failed} failed",
				result.SucceededCount,
				result.FailedCount
			);
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.TenantUserBulkRemoved,
				TargetId: null,
				Details: new {
					TenantId = tenantIdGuid,
					RequestedCount = distinctUserIds.Count,
					result.SucceededCount,
					result.FailedCount,
					UserIds = distinctUserIds,
					FailedItems = result.FailedItems
				}
			),
			cancellationToken
		);

		return TypedResults.Ok(result);
	}
}
