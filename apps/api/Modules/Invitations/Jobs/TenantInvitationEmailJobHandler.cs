using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Modules.Messaging.Entities;
using PublyApp.Api.Modules.Messaging.Jobs;
using PublyApp.Api.Modules.Messaging.Services;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Invitations.Jobs;

/// <summary>
/// Delivers <c>email.tenant-invitation.v1</c> (design §5.4). The eligibility recheck
/// (revoked/accepted/expired/deleted) is invitation-domain logic and is performed under
/// a FOR UPDATE lock on the invitation row — the #811 linearization point. Registered
/// as a SCOPED service; the engine resolves it from a fresh per-job DI scope.
/// </summary>
public sealed class TenantInvitationEmailJobHandler
	: EmailJobHandlerBase<TenantInvitationEmailPayload> {
	public TenantInvitationEmailJobHandler(
		AppDbContext db,
		IEmailSender sender,
		IEmailLogWriter logWriter,
		JobsMetrics metrics
	) : base(db, sender, logWriter, metrics) {
	}

	public override string JobType {
		get { return InvitationEmailJobs.TenantInvitationV1.JobType; }
	}

	protected override EmailKind Kind {
		get { return EmailKind.TenantInvitation; }
	}

	protected override async Task<EmailJobPreparation> PrepareAsync(
		TenantInvitationEmailPayload payload,
		CancellationToken cancellationToken
	) {
		await LockRowAsync("invitations", payload.InvitationId, cancellationToken);

		var invitationQuery =
			from candidate in Db.Invitation.Include(i => i.Tenant)
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

		if (invitation.Tenant is null) {
			return new EmailJobPreparation.Ineligible(
				"tenant_missing", invitation.Email, payload.InvitationId, null
			);
		}

		var level = invitation.AccountLevel ?? AccountLevel.User;
		var envelope = EmailTemplates.TenantInvitation(
			invitation.Email, invitation.Tenant.Name, invitation.Token, level
		);

		return new EmailJobPreparation.Ready(
			envelope, invitation.Email, payload.InvitationId, null
		);
	}

	protected override async Task<EmailTerminalIdentity> ResolveTerminalIdentityAsync(
		TenantInvitationEmailPayload payload,
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
