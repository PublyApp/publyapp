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

public record StaffUserSuspendedResult {
	public required Guid UserId { get; init; }
	public required UserStatus Status { get; init; }
}

public sealed class SuspendStaffUser {
	public static async Task<Results<
		Ok<StaffUserSuspendedResult>,
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
		// suspension is a high-impact lifecycle operation and should be explicit, auditable,
		// and permission-gated separately from routine profile edits.
		if (!Guid.TryParse(userId, out var userIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid user ID",
				ResponseKeys.MalformedId
			);
		}

		var result = await userService.SuspendStaffUserAsync(
			userIdGuid,
			cancellationToken
		);

		if (result is SuspendStaffUserResult.NotFound) {
			return TypedProblems.NotFound(
				"User not found",
				ResponseKeys.NotFound
			);
		}

		if (result is SuspendStaffUserResult.AlreadySuspended) {
			return TypedProblems.Conflict(
				"User is already suspended",
				ResponseKeys.StaffUserAlreadySuspended
			);
		}

		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. Ensure the endpoint has .WithPermission()."
			);
		}

		if (result is not SuspendStaffUserResult.Success success) {
			throw new InvalidOperationException(
				$"Unknown suspend staff user result: {result.GetType().Name}"
			);
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.StaffUserSuspended,
				TargetId: userIdGuid,
				Details: new { TargetUserId = userIdGuid }
			),
			cancellationToken
		);

		return TypedResults.Ok(new StaffUserSuspendedResult {
			UserId = success.UserData.User.GetRequiredId(),
			Status = success.UserData.User.Status,
		});
	}
}
