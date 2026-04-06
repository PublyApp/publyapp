using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Invitations.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Invitations.Handlers.Staff;

public class RevokeInvitationForTenantAsStaff {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppNotFoundHttpResult,
		AppBadRequestHttpResult,
		AppForbiddenHttpResult
	>> HandleRevokeInvitationForTenantAsStaff(
		[FromRoute] string tenantId,
		[FromRoute] string invitationId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IInvitationService invitationService,
		[FromServices] IAuditLogService auditLogService,
		CancellationToken cancellationToken = default
	) {
		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
		}

		if (!Guid.TryParse(tenantId, out Guid tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenantId",
				ResponseKeys.MalformedId
			);
		}

		if (!Guid.TryParse(invitationId, out Guid invitationIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid invitationId",
				ResponseKeys.MalformedId
			);
		}

		RevokeInvitationForTenantAsStaffResult result =
			await invitationService.RevokeInvitationForTenantAsStaffAsync(
				tenantIdGuid,
				invitationIdGuid,
				cancellationToken
			);

		if (result is RevokeInvitationForTenantAsStaffResult.NotFound) {
			return TypedProblems.NotFound("Invitation not found", ResponseKeys.NotFound);
		}

		if (result is RevokeInvitationForTenantAsStaffResult.AlreadyAccepted) {
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
