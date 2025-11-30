using MainApi.Localization;
<<<<<<<< HEAD:apps/api/Src/Modules/Invitations/Handlers/Staff/RevokeStaffInvitation.cs
========
using MainApi.Src.Modules.Shared.Users;
using MainApi.Src.Modules.Shared.Invitations;
using MainApi.Src.Modules.Staff.Audit;
>>>>>>>> e130a4f49 (refactor: Restructure API modules to enhance clarity and maintainability):apps/api/Src/Modules/Staff/Invitations/Handlers/RevokeInvitation.cs
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Invitations.Services;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

<<<<<<<< HEAD:apps/api/Src/Modules/Invitations/Handlers/Staff/RevokeStaffInvitation.cs
namespace MainApi.Src.Modules.Invitations.Handlers.Staff;
========
namespace MainApi.Src.Modules.Staff.Invitations.Handlers;
>>>>>>>> e130a4f49 (refactor: Restructure API modules to enhance clarity and maintainability):apps/api/Src/Modules/Staff/Invitations/Handlers/RevokeInvitation.cs

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
