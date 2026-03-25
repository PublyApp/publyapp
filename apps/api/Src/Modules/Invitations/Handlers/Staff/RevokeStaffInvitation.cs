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

public class RevokeStaffInvitation {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppNotFoundHttpResult,
		AppBadRequestHttpResult,
		AppForbiddenHttpResult
	>> HandleRevokeStaffInvitation(
		[FromRoute] string invitationId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IInvitationService invitationService,
		[FromServices] IAuditLogService auditLogService,
		CancellationToken cancellationToken = default
	) {
		// IMPOSSIBLE STATE: Staff endpoint without staff account
		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
		}

		// Validate invitationId format
		if (!Guid.TryParse(invitationId, out var invitationIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid invitationId",
				ResponseKeys.MalformedId
			);
		}

		// REAL AUTHORIZATION: Check permissions
		if (account.Scope != AccountScope.Staff
			|| account.Level != AccountLevel.Admin) {
			return TypedProblems.Forbidden(
				"User does not have the necessary permissions",
				ResponseKeys.UserDoesNotHaveTheNecessaryPermissions
			);
		}

		var success = await invitationService.RevokeInvitationAsync(
			invitationIdGuid,
			cancellationToken
		);

		if (!success) {
			return TypedProblems.NotFound("Invitation not found", ResponseKeys.NotFound);
		}

		await auditLogService.LogAsync(
			account.UserId,
			AuditActions.InvitationRevoked,
			invitationIdGuid,
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
