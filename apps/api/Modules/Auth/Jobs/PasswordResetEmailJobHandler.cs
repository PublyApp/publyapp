using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Modules.Messaging.Entities;
using PublyApp.Api.Modules.Messaging.Jobs;
using PublyApp.Api.Modules.Messaging.Services;

namespace PublyApp.Api.Modules.Auth.Jobs;

/// <summary>
/// Delivers <c>email.password-reset.v1</c> (design §5.4, #809). Token-validity is
/// auth-domain logic and is rechecked under a FOR UPDATE lock on the user row (the
/// #811-equivalent linearization point): a token cleared or expired before the locked
/// read yields CancelledIneligible, no send. Scoped; the engine resolves it per job.
/// </summary>
public sealed class PasswordResetEmailJobHandler
	: EmailJobHandlerBase<PasswordResetEmailPayload> {
	public PasswordResetEmailJobHandler(
		AppDbContext db,
		IEmailSender sender,
		IEmailLogWriter logWriter,
		JobsMetrics metrics
	) : base(db, sender, logWriter, metrics) {
	}

	public override string JobType {
		get { return AuthEmailJobs.PasswordResetV1.JobType; }
	}

	protected override EmailKind Kind {
		get { return EmailKind.PasswordReset; }
	}

	protected override async Task<EmailJobPreparation> PrepareAsync(
		PasswordResetEmailPayload payload,
		CancellationToken cancellationToken
	) {
		await LockRowAsync("users", payload.UserId, cancellationToken);

		var userQuery =
			from candidate in Db.User
			where candidate.Id == payload.UserId && !candidate.IsDeleted
			select candidate;
		var user = await userQuery.FirstOrDefaultAsync(cancellationToken);

		if (user is null) {
			return new EmailJobPreparation.Ineligible(
				"user_not_found", string.Empty, null, payload.UserId
			);
		}

		if (user.PasswordResetToken is null
			|| user.PasswordResetTokenExpiresAt is not { } expiresAt
			|| expiresAt <= DateTime.UtcNow) {
			return new EmailJobPreparation.Ineligible(
				"reset_token_invalid", user.Email, null, payload.UserId
			);
		}

		var envelope = EmailTemplates.PasswordReset(user.Email, user.PasswordResetToken);

		return new EmailJobPreparation.Ready(envelope, user.Email, null, payload.UserId);
	}

	protected override async Task<EmailTerminalIdentity> ResolveTerminalIdentityAsync(
		PasswordResetEmailPayload payload,
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
