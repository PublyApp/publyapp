using System.ComponentModel.DataAnnotations;
using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class BulkDeleteStaffUsersBody {
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

public sealed class BulkDeleteStaffUsersBodyValidator
	: AbstractValidator<BulkDeleteStaffUsersBody> {
	public BulkDeleteStaffUsersBodyValidator() {
		RuleFor(x => x.UserIds)
			.MustBeRequiredGuidArray(
				fieldName: "userIds",
				itemName: "userId",
				maxCount: 100
			);
	}
}

public sealed class BulkDeleteStaffUsers {
	public static async Task<Ok<BulkStaffUserActionResult>>
		Handle(
			[FromBody] BulkDeleteStaffUsersBody body,
			[FromServices] IStaffUserLifecycleService userService,
			[FromServices] IAuditLogService auditLogService,
			[FromServices] IRequestAuthContext authContext,
			[FromServices] ILogger<BulkDeleteStaffUsers> logger,
			CancellationToken cancellationToken = default
	) {
		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. Ensure the endpoint has .WithPermission()."
			);
		}

		var requestedUserIds = body.GetUserIds().Distinct().ToList();
		var result = await userService.BulkDeleteStaffUsersAsync(
			requestedUserIds,
			cancellationToken
		);
		var failedUserIds = result.FailedItems
			.Select(item => item.UserId)
			.ToHashSet();
		var succeededUserIds = requestedUserIds
			.Where(userId => !failedUserIds.Contains(userId))
			.ToList();

		if (logger.IsEnabled(LogLevel.Information)) {
			logger.LogInformation(
				"Bulk delete staff users completed: {Succeeded} succeeded, {Failed} failed",
				result.SucceededCount,
				result.FailedCount
			);
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.StaffUserBulkDeleted,
				TargetId: null,
				Details: new {
					RequestedCount = requestedUserIds.Count,
					SucceededCount = result.SucceededCount,
					FailedCount = result.FailedCount,
					RequestedUserIds = requestedUserIds,
					SucceededUserIds = succeededUserIds,
					FailedItems = result.FailedItems
				}
			),
			cancellationToken
		);

		return TypedResults.Ok(result);
	}
}
