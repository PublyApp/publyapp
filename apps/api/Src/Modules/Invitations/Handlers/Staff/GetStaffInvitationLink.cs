using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Auth.Utils;
using MainApi.Src.Modules.Invitations.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Invitations.Handlers.Staff;

public class GetStaffInvitationLinkResult {
	public required string Link { get; init; }
}

public static class GetStaffInvitationLink {
	public static async Task<Results<
		Ok<GetStaffInvitationLinkResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> HandleGetStaffInvitationLink(
		[FromRoute] string invitationId,
		[FromServices] IInvitationService invitationService,
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

		// Only pending invitations can expose a link.
		if (!invitation.CanBeAccepted()) {
			return TypedProblems.BadRequest("Invitation is not pending", ResponseKeys.BadRequest);
		}

		var link = AuthUtils.CreateAcceptInvitationUrl(invitation.Token, invitation.Email);

		return TypedResults.Ok(new GetStaffInvitationLinkResult { Link = link });
	}
}
