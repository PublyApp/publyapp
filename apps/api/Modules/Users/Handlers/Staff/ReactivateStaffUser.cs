using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Users.Entities;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public record StaffUserReactivatedResult {
	public required Guid UserId { get; init; }
	public required UserStatus Status { get; init; }
}

public sealed class ReactivateStaffUser {
	public static async Task<Results<
		Ok<StaffUserReactivatedResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppConflictHttpResult
	>> Handle(
		[FromRoute] string userId,
		[FromServices] IStaffUserLifecycleService userService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		CancellationToken cancellationToken = default
	) {
		// Dedicated endpoint instead of PATCH status:
		// lifecycle operations are explicit so they can be permission-gated and audited.
		if (!Guid.TryParse(userId, out var userIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid user ID",
				ResponseKeys.MalformedId
			);
		}

		var result = await userService.ReactivateStaffUserAsync(
			userIdGuid,
			cancellationToken
		);

		if (result is ReactivateStaffUserResult.NotFound) {
			return TypedProblems.NotFound(
				"User not found",
				ResponseKeys.NotFound
			);
		}

		if (result is ReactivateStaffUserResult.NotSuspended) {
			return TypedProblems.Conflict(
				"User is not currently suspended",
				ResponseKeys.StaffUserNotSuspended
			);
		}

		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. Ensure the endpoint has .WithPermission()."
			);
		}

		if (result is not ReactivateStaffUserResult.Success success) {
			throw new InvalidOperationException(
				$"Unknown reactivate staff user result: {result.GetType().Name}"
			);
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.StaffUserReactivated,
				TargetId: userIdGuid,
				Details: new { TargetUserId = userIdGuid }
			),
			cancellationToken
		);

		return TypedResults.Ok(new StaffUserReactivatedResult {
			UserId = success.UserData.User.GetRequiredId(),
			Status = success.UserData.User.Status,
		});
	}
}
