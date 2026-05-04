using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Users.Handlers.Staff;

public class DeleteStaffUser {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> HandleDeleteStaffUser(
		[FromRoute] string userId,
		[FromServices] IUserService userService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(userId, out var userIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid user ID",
				ResponseKeys.MalformedId
			);
		}

		var result = await userService.DeleteStaffUserAsync(
			userIdGuid,
			cancellationToken
		);

		if (result is DeleteStaffUserResult.NotFound) {
			return TypedProblems.NotFound(
				"Staff user not found",
				ResponseKeys.UserNotFound
			);
		}

		if (result is DeleteStaffUserResult.NotSuspended) {
			return TypedProblems.BadRequest(
				"Only suspended staff users can be deleted",
				ResponseKeys.StaffUserNotSuspendedCannotDelete
			);
		}

		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account missing from auth context."
			);
		}

		if (result is not DeleteStaffUserResult.Success success) {
			throw new InvalidOperationException(
				$"Unknown delete staff user result: {result.GetType().Name}"
			);
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.StaffUserDeleted,
				TargetId: userIdGuid,
				Details: new { UserEmail = success.UserData.User.Email }
			),
			cancellationToken
		);

		return TypedResults.Ok(
			ApiResponse.Create(
				"Staff member deleted successfully",
				ResponseKeys.StaffUserDeletedSuccess
			)
		);
	}
}
