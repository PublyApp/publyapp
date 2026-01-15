using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Invitations.Services;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Invitations.Handlers.Staff;

public static class RevokeStaffInvitation {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppNotFoundHttpResult,
		AppForbiddenHttpResult
	>> HandleRevokeStaffInvitation(
		[FromRoute] Guid invitationId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IInvitationService invitationService,
		[FromServices] IAuditLogService auditLogService,
		CancellationToken cancellationToken = default
	) {
		// Authorization check
		var account = authContext.AccountStaff;
		if (account is null
			|| account.Scope != AccountScope.Staff
			|| account.Level != AccountLevel.Admin) {
			return TypedProblems.Forbidden(
				"User does not have the necessary permissions",
				ResponseKeys.UserDoesNotHaveTheNecessaryPermissions
			);
		}

		var success = await invitationService.RevokeInvitationAsync(
			invitationId,
			cancellationToken
		);

		if (!success) {
			return TypedProblems.NotFound("Invitation not found", ResponseKeys.NotFound);
		}

		await auditLogService.LogAsync(
			account.UserId,
			AuditActions.InvitationRevoked,
			invitationId,
			null,
			cancellationToken
		);

		return TypedResults.Ok(
			ApiResponse.Create(
				"Invitation revoked successfully",
				ResponseKeys.InvitationRevoked
			)
		);
	}
}
