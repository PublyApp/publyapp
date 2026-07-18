using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Modules.Messaging.Entities;
using PublyApp.Api.Modules.Messaging.Jobs;
using PublyApp.Api.Modules.Messaging.Services;

namespace PublyApp.Api.Modules.Auth.Jobs;

public sealed class EmailVerificationEmailJobHandler
	: EmailJobHandlerBase<VerifyEmailPayload> {
	public EmailVerificationEmailJobHandler(
		AppDbContext db,
		IEmailSender sender,
		IEmailLogWriter logWriter,
		JobsMetrics metrics
	) : base(db, sender, logWriter, metrics) {
	}

	public override string JobType {
		get { return AuthEmailJobs.VerifyEmailV1.JobType; }
	}

	protected override EmailKind Kind {
		get { return EmailKind.EmailVerification; }
	}

	protected override async Task<EmailJobPreparation> PrepareAsync(
		VerifyEmailPayload payload,
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

		if (user.IsVerified && !payload.IsWelcomeEmail) {
			return new EmailJobPreparation.Ineligible(
				"email_already_verified", user.Email, null, payload.UserId
			);
		}

		if (user.EmailVerifyToken is null
			|| user.EmailVerifyTokenExpiresAt is not { } expiresAt
			|| expiresAt <= DateTime.UtcNow) {
			return new EmailJobPreparation.Ineligible(
				"verify_token_invalid", string.Empty, null, payload.UserId
			);
		}

		var envelope = payload.IsWelcomeEmail
			? EmailTemplates.EmailVerificationWelcome(user.Email, user.EmailVerifyToken)
			: EmailTemplates.EmailVerificationRequest(user.Email, user.EmailVerifyToken);

		return new EmailJobPreparation.Ready(envelope, user.Email, null, payload.UserId);
	}

	protected override async Task<EmailTerminalIdentity> ResolveTerminalIdentityAsync(
		VerifyEmailPayload payload,
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
