using System.Text.Json;

using FluentValidation;

using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.Validation;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Users.Handlers.Staff;

public sealed class BulkReactivateStaffUsersBody {
	public required JsonElement UserIds { get; init; }

	public List<Guid> GetUserIds() {
		var userIds = new List<Guid>();

		foreach (var userIdElement in UserIds.EnumerateArray()) {
			userIds.Add(userIdElement.GetValueAsGuid());
		}

		return userIds;
	}
}

public sealed class BulkReactivateStaffUsersBodyValidator
	: AbstractValidator<BulkReactivateStaffUsersBody> {
	public BulkReactivateStaffUsersBodyValidator() {
		RuleFor(x => x.UserIds)
			.MustBeRequiredGuidArray(
				fieldName: "userIds",
				itemName: "userId",
				maxCount: 100
			);
	}
}

public sealed class BulkReactivateStaffUsers {
	public static async Task<Ok<BulkStaffUserActionResult>>
		HandleBulkReactivateStaffUsers(
			[FromBody] BulkReactivateStaffUsersBody body,
			[FromServices] IUserService userService,
			[FromServices] IAuditLogService auditLogService,
			[FromServices] IRequestAuthContext authContext,
			[FromServices] ILogger<BulkReactivateStaffUsers> logger,
			CancellationToken cancellationToken = default
	) {
		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. Ensure the endpoint has .WithPermission()."
			);
		}

		var userIds = body.GetUserIds();
		var result = await userService.BulkReactivateStaffUsersAsync(
			userIds,
			cancellationToken
		);

		if (logger.IsEnabled(LogLevel.Information)) {
			logger.LogInformation(
				"Bulk reactivate staff users completed: {Succeeded} succeeded, {Failed} failed",
				result.SucceededCount,
				result.FailedCount
			);
		}

		await auditLogService.LogAsync(
			account.UserId,
			AuditActions.StaffUserBulkReactivated,
			null,
			new {
				RequestedCount = userIds.Distinct().Count(),
				SucceededCount = result.SucceededCount,
				FailedCount = result.FailedCount,
				UserIds = userIds.Distinct().ToList()
			},
			cancellationToken
		);

		return TypedResults.Ok(result);
	}
}
