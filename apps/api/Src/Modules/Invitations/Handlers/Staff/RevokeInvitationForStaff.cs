using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Invitations.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Invitations.Handlers.Staff;

public class RevokeInvitationForStaff {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppNotFoundHttpResult,
		AppBadRequestHttpResult,
		AppForbiddenHttpResult
	>> HandleRevokeInvitationForStaff(
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

		RevokeInvitationForStaffResult result =
			await invitationService.RevokeInvitationForStaffAsync(
			invitationIdGuid,
			cancellationToken
		);

		if (result is RevokeInvitationForStaffResult.NotFound) {
			return TypedProblems.NotFound("Invitation not found", ResponseKeys.NotFound);
		}

		if (result is RevokeInvitationForStaffResult.AlreadyAccepted) {
			return TypedProblems.BadRequest(
				"Accepted invitations cannot be revoked",
				ResponseKeys.BadRequest
			);
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
