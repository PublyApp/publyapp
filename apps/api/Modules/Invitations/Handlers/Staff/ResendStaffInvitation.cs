using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
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
		[FromServices] IEmailService emailService,
		[FromServices] ILogger<ResendStaffInvitation> logger,
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

		// Best-effort resend; failures stay best-effort and do not leak to caller.
		_ = Task.Run(
			async () => {
				try {
					await emailService.SendInvitationToJoinStaffEmailAsync(invitation.Email, invitation.Token);
				} catch (Exception ex) {
					if (logger.IsEnabled(LogLevel.Error)) {
						logger.LogError(
							ex,
							"Error sending invitation reminder to {Email}",
							invitation.Email
						);
					}
				}
			},
			CancellationToken.None
		);

		return TypedResults.Ok(
			ApiResponse.Create(
				"Invitation email resent successfully",
				ResponseKeys.InvitationResent
			)
		);
	}
}
