using MainApi.Localization;
using MainApi.Lib;
using MainApi.Lib.ProblemResults;
using MainApi.Modules.AuditLogs.Entities;
using MainApi.Modules.AuditLogs.Services;
using MainApi.Modules.Invitations.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Modules.Invitations.Handlers.Staff;

public sealed class RevokeInvitationForTenantAsStaff {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppNotFoundHttpResult,
		AppBadRequestHttpResult,
		AppForbiddenHttpResult
	>> Handle(
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
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.InvitationRevoked,
				TargetId: invitationIdGuid
			),
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
