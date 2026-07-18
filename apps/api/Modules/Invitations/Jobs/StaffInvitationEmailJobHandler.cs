using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Modules.Messaging.Entities;
using PublyApp.Api.Modules.Messaging.Jobs;
using PublyApp.Api.Modules.Messaging.Services;

namespace PublyApp.Api.Modules.Invitations.Jobs;

/// <summary>
/// Delivers <c>email.staff-invitation.v1</c> (design §5.4). Eligibility recheck under a
/// FOR UPDATE lock on the invitation row (the #811 linearization point). Scoped; the
/// engine resolves it per job.
/// </summary>
public sealed class StaffInvitationEmailJobHandler
	: EmailJobHandlerBase<StaffInvitationEmailPayload> {
	public StaffInvitationEmailJobHandler(
		AppDbContext db,
		IEmailSender sender,
		IEmailLogWriter logWriter,
		JobsMetrics metrics
	) : base(db, sender, logWriter, metrics) {
	}

	public override string JobType {
		get { return InvitationEmailJobs.StaffInvitationV1.JobType; }
	}

	protected override EmailKind Kind {
		get { return EmailKind.StaffInvitation; }
	}

	protected override async Task<EmailJobPreparation> PrepareAsync(
		StaffInvitationEmailPayload payload,
		CancellationToken cancellationToken
	) {
		await LockRowAsync("invitations", payload.InvitationId, cancellationToken);

		var invitationQuery =
			from candidate in Db.Invitation
			where candidate.Id == payload.InvitationId
			select candidate;
		var invitation = await invitationQuery.FirstOrDefaultAsync(cancellationToken);

		if (invitation is null) {
			return new EmailJobPreparation.Ineligible(
				"invitation_not_found", string.Empty, payload.InvitationId, null
			);
		}

		if (invitation.IsDeleted
			|| invitation.IsRevoked()
			|| invitation.IsAccepted()
			|| invitation.IsExpired(DateTime.UtcNow)) {
			return new EmailJobPreparation.Ineligible(
				"invitation_ineligible", invitation.Email, payload.InvitationId, null
			);
		}

		var envelope = EmailTemplates.StaffInvitation(invitation.Email, invitation.Token);

		return new EmailJobPreparation.Ready(
			envelope, invitation.Email, payload.InvitationId, null
		);
	}

	protected override async Task<EmailTerminalIdentity> ResolveTerminalIdentityAsync(
		StaffInvitationEmailPayload payload,
		CancellationToken cancellationToken
	) {
		var invitationQuery =
			from candidate in Db.Invitation.AsNoTracking()
			where candidate.Id == payload.InvitationId
			select candidate;
		var invitation = await invitationQuery.FirstOrDefaultAsync(cancellationToken);

		return new EmailTerminalIdentity(
			invitation?.Email ?? "(unknown)", payload.InvitationId, null
		);
	}
}
