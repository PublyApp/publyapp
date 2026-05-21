using MainApi.Infrastructure.Messaging.Email;
using MainApi.Lib;
using MainApi.Lib.ProblemResults;
using MainApi.Localization;
using MainApi.Modules.Invitations.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Modules.Invitations.Handlers.Staff;

public class ResendStaffInvitation {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> HandleResendStaffInvitation(
		[FromRoute] string invitationId,
		[FromServices] IInvitationService invitationService,
		[FromServices] IEmailService emailService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(invitationId, out var invitationIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid invitationId",
				ResponseKeys.MalformedId
			);
		}

		var invitation = await invitationService.GetStaffInvitationByIdAsync(
			invitationIdGuid,
			cancellationToken
		);

		if (invitation is null) {
			return TypedProblems.NotFound("Invitation not found", ResponseKeys.NotFound);
		}

		// Only pending invitations can be resent.
		if (!invitation.CanBeAccepted()) {
			return TypedProblems.BadRequest("Invitation is not pending", ResponseKeys.BadRequest);
		}

		// Send email using existing invitation token (no rotation).
		await emailService.SendInvitationToJoinStaffEmailAsync(invitation.Email, invitation.Token);

		return TypedResults.Ok(
			ApiResponse.Create(
				"Invitation email resent successfully",
				ResponseKeys.InvitationResent
			)
		);
	}
}
