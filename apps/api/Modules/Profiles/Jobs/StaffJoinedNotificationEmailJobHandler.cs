using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Modules.Messaging.Entities;
using PublyApp.Api.Modules.Messaging.Jobs;
using PublyApp.Api.Modules.Messaging.Services;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Profiles.Jobs;

/// <summary>
/// Delivers <c>email.staff-joined-notification.v1</c> (#291): the "you have been added
/// as a staff member" notification to an EXISTING user gaining a staff profile.
/// Eligibility recheck under a FOR UPDATE lock on the user row (the #811 linearization
/// point, same contract as <c>PasswordResetEmailJobHandler</c>): a user deleted or
/// suspended before the locked read yields CancelledIneligible, no send. Scoped; the
/// engine resolves it per job.
/// </summary>
public sealed class StaffJoinedNotificationEmailJobHandler
	: EmailJobHandlerBase<StaffJoinedNotificationEmailPayload> {
	public StaffJoinedNotificationEmailJobHandler(
		AppDbContext db,
		IEmailSender sender,
		IEmailLogWriter logWriter,
		JobsMetrics metrics
	) : base(db, sender, logWriter, metrics) {
	}

	public override string JobType {
		get { return StaffProfileEmailJobs.StaffJoinedNotificationV1.JobType; }
	}

	protected override EmailKind Kind {
		get { return EmailKind.StaffJoinedNotification; }
	}

	protected override async Task<EmailJobPreparation> PrepareAsync(
		StaffJoinedNotificationEmailPayload payload,
		CancellationToken cancellationToken
	) {
		await LockRowAsync("users", payload.UserId, cancellationToken);

		var userQuery =
			from candidate in Db.User.AsNoTracking()
			where candidate.Id == payload.UserId && !candidate.IsDeleted
			select candidate;
		var user = await userQuery.FirstOrDefaultAsync(cancellationToken);

		if (user is null) {
			return new EmailJobPreparation.Ineligible(
				"user_not_found", string.Empty, null, payload.UserId
			);
		}

		if (user.Status == UserStatus.Suspended) {
			return new EmailJobPreparation.Ineligible(
				"user_suspended", user.Email, null, payload.UserId
			);
		}

		var envelope = EmailTemplates.StaffJoinedNotification(user.Email);

		return new EmailJobPreparation.Ready(envelope, user.Email, null, payload.UserId);
	}

	protected override async Task<EmailTerminalIdentity> ResolveTerminalIdentityAsync(
		StaffJoinedNotificationEmailPayload payload,
		CancellationToken cancellationToken
	) {
		var userQuery =
			from candidate in Db.User.AsNoTracking()
			where candidate.Id == payload.UserId
			select candidate;
		var user = await userQuery.FirstOrDefaultAsync(cancellationToken);

		return new EmailTerminalIdentity(user?.Email ?? "(unknown)", null, payload.UserId);
	}
}
