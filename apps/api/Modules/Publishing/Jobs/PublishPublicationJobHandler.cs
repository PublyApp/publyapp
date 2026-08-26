using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Providers;
using PublyApp.Api.Modules.Publishing.Services;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Lib;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.Publishing.Jobs;

/// <summary>
/// Worker-side execution of <c>publishing.publish-publication.v1</c> (Epic D §3/D1).
/// At-least-once contract: the deterministic idempotency key makes any re-run collide
/// with an already-created remote record instead of duplicating it, and EVERY status
/// write goes through the single transition service. Each classified failure maps to
/// exactly one domain outcome: account failure pauses the publication and flags the
/// account NeedsReconnect (terminal, no retry), content failure fails without retry,
/// transient failures return to the engine's backoff until the ceiling — then the
/// publication is failed and the account is flagged while the engine dead-letters.
/// </summary>
public sealed class PublishPublicationJobHandler : IJobHandler {
	private readonly AppDbContext _db;
	private readonly IPublishProvider _publishProvider;
	private readonly ISocialSessionProvider _socialSessionProvider;
	private readonly IPublicationStatusTransitionService _transitions;

	public PublishPublicationJobHandler(
		AppDbContext db,
		IPublishProvider publishProvider,
		ISocialSessionProvider socialSessionProvider,
		IPublicationStatusTransitionService transitions
	) {
		_db = db;
		_publishProvider = publishProvider;
		_socialSessionProvider = socialSessionProvider;
		_transitions = transitions;
	}

	public string JobType {
		get { return PublishingJobs.PublishPublicationV1.JobType; }
	}

	public async Task<JobOutcome> HandleAsync(
		JobContext context,
		CancellationToken cancellationToken
	) {
		var payload = context.DeserializePayload<PublishPublicationPayload>();

		var publication = await _db.Publication.SingleOrDefaultAsync(
			candidate => candidate.Id == payload.PublicationId && !candidate.IsDeleted,
			cancellationToken
		);
		if (publication is null) {
			return new JobOutcome.Cancelled("publication_not_found");
		}

		if (publication.Status is PublicationStatus.Published or PublicationStatus.Failed) {
			return new JobOutcome.Cancelled("publication_already_terminal");
		}

		var publicationId = publication.GetRequiredId();
		if (!await _transitions.MarkInProgressAsync(
				new MarkPublicationInProgressArgs(publicationId, publication.TenantId),
				cancellationToken
			)) {
			return new JobOutcome.Cancelled("publication_not_found");
		}

		var sessionResult = await _socialSessionProvider.OpenSessionAsync(
			publication.SocialAccountId, cancellationToken
		);
		if (sessionResult is SocialSessionResult.AccountFailure sessionAccount) {
			await PauseForAccountAsync(publication, sessionAccount.Cause, cancellationToken);
			return JobOutcome.Succeeded;
		}

		if (sessionResult is SocialSessionResult.Transient sessionTransient) {
			return await FailTransientAsync(
				publication, sessionTransient.Cause, context, cancellationToken
			);
		}

		if (sessionResult is not SocialSessionResult.Opened opened) {
			throw new InvalidOperationException(
				$"Unhandled SocialSessionResult kind '{sessionResult.GetType().Name}'."
			);
		}

		var post = await _db.Post.SingleOrDefaultAsync(
			candidate => candidate.Id == publication.PostId && !candidate.IsDeleted,
			cancellationToken
		);
		if (post is null) {
			await _transitions.MarkFailedAsync(
				new MarkPublicationFailedArgs(
					publicationId,
					publication.TenantId,
					"the post behind this publication no longer exists"
				),
				cancellationToken
			);
			return JobOutcome.Succeeded;
		}

		var result = await _publishProvider.PublishAsync(
			new PublishRequest {
				PublicationId = publicationId,
				IdempotencyKey = publication.IdempotencyKey,
				PostBody = post.Body,
				ScheduledAtUtc = publication.ScheduledAtUtc,
				Session = opened.Session,
			},
			cancellationToken
		);

		switch (result) {
			case PublishResult.Published published:
				return await SucceedAsync(publication, published.RecordId, published.RecordUrl, cancellationToken);
			case PublishResult.AlreadyExistsTreatedAsPublished alreadyExists:
				return await SucceedAsync(publication, alreadyExists.RecordId, alreadyExists.RecordUrl, cancellationToken);
			case PublishResult.ContentFailure content:
				await _transitions.MarkFailedAsync(
					new MarkPublicationFailedArgs(
						publicationId,
						publication.TenantId,
						$"Bluesky refused the content: {content.Cause}"
					),
					cancellationToken
				);
				return JobOutcome.Succeeded;
			case PublishResult.AccountFailure account:
				await PauseForAccountAsync(publication, account.Cause, cancellationToken);
				return JobOutcome.Succeeded;
			case PublishResult.TransientFailure transient:
				return await FailTransientAsync(publication, transient.Cause, context, cancellationToken);
			default:
				throw new InvalidOperationException(
					$"Unhandled PublishResult kind '{result.GetType().Name}'."
				);
		}
	}

	/// <summary>
	/// Engine hook INSIDE the terminal (DLQ) transaction: a transient chain that
	/// exhausted its ceiling leaves the queue, so the account must hear about it.
	/// Skips silently when the domain moved on (publication gone or no longer Failed)
	/// rather than fighting a concurrent transition inside this transaction.
	/// </summary>
	public async Task OnTerminalFailureAsync(
		JobContext context,
		CancellationToken cancellationToken
	) {
		var payload = context.DeserializePayload<PublishPublicationPayload>();
		var publication = await _db.Publication.SingleOrDefaultAsync(
			candidate => candidate.Id == payload.PublicationId && !candidate.IsDeleted,
			cancellationToken
		);
		if (publication is null || publication.Status != PublicationStatus.Failed) {
			return;
		}

		var cause =
			$"publishing kept failing; reconnect the account. Last cause: "
				+ $"{LastErrorSanitiser.Sanitize(context.LastError ?? "unknown error")}";
		await FlagAccountNeedsReconnectAsync(publication.SocialAccountId, cause, cancellationToken);
	}

	private async Task<JobOutcome> SucceedAsync(
		Publication publication,
		string recordId,
		string recordUrl,
		CancellationToken cancellationToken
	) {
		await _transitions.MarkPublishedAsync(
			new MarkPublicationPublishedArgs(
				publication.GetRequiredId(),
				publication.TenantId,
				recordId,
				recordUrl
			),
			cancellationToken
		);
		await StampAccountLastSuccessAsync(publication.SocialAccountId, cancellationToken);
		return JobOutcome.Succeeded;
	}

	private async Task PauseForAccountAsync(
		Publication publication,
		string rawCause,
		CancellationToken cancellationToken
	) {
		var cause =
			$"the social account needs reconnecting: "
				+ $"{LastErrorSanitiser.Sanitize(rawCause) ?? rawCause}";
		await _transitions.MarkPausedAsync(
			new MarkPublicationPausedArgs(
				publication.GetRequiredId(),
				publication.TenantId,
				cause
			),
			cancellationToken
		);
		await FlagAccountNeedsReconnectAsync(publication.SocialAccountId, cause, cancellationToken);

		// C4: sibling-pause sweep — the account's other scheduled rows must not sit
		// queued behind broken credentials. Same sanitised cause everywhere. All moves
		// go through the transition service, so the architecture writer-scan stays green.
		var siblings = await _db.Publication
			.Where(p => p.SocialAccountId == publication.SocialAccountId
				&& p.TenantId == publication.TenantId
				&& p.Status == PublicationStatus.Scheduled)
			.ToListAsync(cancellationToken);
		foreach (var sibling in siblings) {
			await _transitions.MarkPausedAsync(
				new MarkPublicationPausedArgs(
					sibling.GetRequiredId(),
					publication.TenantId,
					cause
				),
				cancellationToken
			);
		}
	}

	private async Task<JobOutcome> FailTransientAsync(
		Publication publication,
		string rawCause,
		JobContext context,
		CancellationToken cancellationToken
	) {
		var cause = LastErrorSanitiser.Sanitize(rawCause) ?? rawCause;
		if (context.Attempts + 1 >= context.MaxAttempts) {
			await _transitions.MarkFailedAsync(
				new MarkPublicationFailedArgs(
					publication.GetRequiredId(),
					publication.TenantId,
					$"publishing did not succeed after {context.MaxAttempts} attempts: {cause}"
				),
				cancellationToken
			);
			return new JobOutcome.PermanentFailure(
				$"publishing gave up after {context.MaxAttempts} attempts: {cause}"
			);
		}

		return new JobOutcome.Retry(Error: cause);
	}

	private async Task StampAccountLastSuccessAsync(
		Guid socialAccountId,
		CancellationToken cancellationToken
	) {
		var account = await _db.SocialAccount.SingleOrDefaultAsync(
			candidate => candidate.Id == socialAccountId && !candidate.IsDeleted,
			cancellationToken
		);
		if (account is null) {
			return;
		}

		account.LastSuccessAt = DateTime.UtcNow;
		await _db.SaveChangesAsync(cancellationToken);
	}

	private async Task FlagAccountNeedsReconnectAsync(
		Guid socialAccountId,
		string sanitisedCause,
		CancellationToken cancellationToken
	) {
		var account = await _db.SocialAccount.SingleOrDefaultAsync(
			candidate => candidate.Id == socialAccountId && !candidate.IsDeleted,
			cancellationToken
		);
		if (account is null) {
			return;
		}

		account.Status = SocialAccountStatus.NeedsReconnect;
		account.LastError = sanitisedCause;
		await _db.SaveChangesAsync(cancellationToken);
	}
}
