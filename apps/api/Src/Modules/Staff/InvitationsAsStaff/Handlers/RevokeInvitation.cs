using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Modules.Shared.Invitations;
using MainApi.Src.Modules.Shared.Users;
using MainApi.Src.Modules.Staff.AuditLogs;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Staff.InvitationsAsStaff.Handlers;

public static class RevokeInvitation {
	public static async Task<Results<
		Ok<ApiResponse>,
		NotFound<ApiResponse>,
		JsonHttpResult<ApiResponse>
	>> HandleRevokeInvitation(
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
			return TypedResults.Json(
				ApiResponse.Create(
					"User does not have the necessary permissions",
					ResponseKeys.UserDoesNotHaveTheNecessaryPermissions
				),
				statusCode: StatusCodes.Status403Forbidden
			);
		}

		var success = await invitationService.RevokeInvitationAsync(
			invitationId,
			cancellationToken
		);

		if (!success) {
			return TypedResults.NotFound(
				ApiResponse.Create("Invitation not found", ResponseKeys.NotFound)
			);
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
