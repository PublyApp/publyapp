using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Invitations.Jobs;
using PublyApp.Api.Modules.Invitations.Services;

namespace PublyApp.Api.Modules.Invitations.Handlers.Staff;

public sealed class ResendStaffInvitation {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string invitationId,
		[FromServices] IInvitationQueryService invitationQueryService,
		[FromServices] IJobEnqueuer jobEnqueuer,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(invitationId, out var invitationIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid invitationId",
				ResponseKeys.MalformedId
			);
		}

		var invitation = await invitationQueryService.GetStaffInvitationByIdAsync(
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

		await jobEnqueuer.EnqueueAsync(
			InvitationEmailJobs.StaffInvitationV1,
			new StaffInvitationEmailPayload { InvitationId = invitation.GetRequiredId() },
			cancellationToken: cancellationToken
		);

		return TypedResults.Ok(
			ApiResponse.Create(
				"Invitation email resent successfully",
				ResponseKeys.InvitationResent
			)
		);
	}
}
