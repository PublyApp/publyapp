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

public record StaffUserReactivatedResult {
	public required Guid UserId { get; init; }
	public required string Status { get; init; }
}

public class ReactivateStaffUser {
	public static async Task<Results<
		Ok<StaffUserReactivatedResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppConflictHttpResult
	>> HandleReactivateStaffUser(
		[FromRoute] string userId,
		[FromServices] IUserService userService,
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
			account.UserId,
			AuditActions.StaffUserReactivated,
			userIdGuid,
			new { TargetUserId = userIdGuid },
			cancellationToken
		);

		return TypedResults.Ok(new StaffUserReactivatedResult {
			UserId = success.UserData.User.GetRequiredId(),
			Status = User.GetStatusDescription(success.UserData.User.Status),
		});
	}
}
