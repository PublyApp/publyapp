using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Users.Entities;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Users.Handlers.Staff;

public record StaffUserSuspendedResult {
	public required Guid UserId { get; init; }
	public required string Status { get; init; }
}

public class SuspendStaffUser {
	public static async Task<Results<
		Ok<StaffUserSuspendedResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppConflictHttpResult
	>> HandleSuspendStaffUser(
		[FromRoute] string userId,
		[FromServices] IUserService userService,
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
			Status = User.GetStatusDescription(success.UserData.User.Status),
		});
	}
}
