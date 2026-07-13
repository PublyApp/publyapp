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

// Wire-contract types, kept distinct from the service's BulkTenantUserActionResult /
// BulkTenantUserActionFailedItem so a future refactor of the service record can't
// silently mutate the public API contract and the generated Kiota client.
public sealed class BulkRemoveTenantUsersResult {
	public required int SucceededCount { get; init; }
	public required int FailedCount { get; init; }
	public required List<BulkRemoveTenantUsersFailedItem> FailedItems { get; init; }
}

public sealed class BulkRemoveTenantUsersFailedItem {
	public required Guid UserId { get; init; }
	// Stable token ("not-found" / "last-admin"), not English prose — the frontend
	// translates it; see TenantUserMembershipOperations.BulkRemoveUsersFromTenantAsync.
	public required string Error { get; init; }
}

public sealed class BulkRemoveTenantUsersAsStaff {
	public static async Task<
		Results<Ok<BulkRemoveTenantUsersResult>, AppBadRequestHttpResult>
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

		// Per docs/guides/bulk-action-ux-conventions.md §6: one row per succeeded item via
		// LogManyAsync (not a loop of LogAsync), wrapped in try/catch — the membership
		// transaction has already committed by this point, so a logging hiccup must never
		// turn an already-successful bulk remove into a 500.
		var failedUserIds = result.FailedItems
			.Select(item => item.UserId)
			.ToHashSet();
		var succeededUserIds = distinctUserIds
			.Where(id => !failedUserIds.Contains(id))
			.ToList();

		if (succeededUserIds.Count > 0) {
			try {
				await auditLogService.LogManyAsync(
					succeededUserIds.Select(userId => new CreateAuditLogArgs(
						UserId: account.UserId,
						Action: AuditActions.TenantUserBulkRemoved,
						TargetId: userId,
						Details: new { TenantId = tenantIdGuid }
					)).ToList(),
					cancellationToken
				);
			} catch (Exception ex) {
				logger.LogError(ex, "Failed to write audit logs for bulk remove");
			}
		}

		return TypedResults.Ok(new BulkRemoveTenantUsersResult {
			SucceededCount = result.SucceededCount,
			FailedCount = result.FailedCount,
			FailedItems = result.FailedItems
				.Select(item => new BulkRemoveTenantUsersFailedItem {
					UserId = item.UserId,
					Error = item.Error
				})
				.ToList()
		});
	}
}
