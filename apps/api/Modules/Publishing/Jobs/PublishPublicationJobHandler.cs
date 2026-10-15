using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Lib;
using PublyApp.Api.Modules.Publishing.Providers;
using PublyApp.Api.Modules.Publishing.Providers.Capabilities;
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
	private readonly AppDbContext _Db;
	private readonly IFileStorage _FileStorage;
	private readonly IPublishProvider _PublishProvider;
	private readonly ISocialSessionProvider _SocialSessionProvider;
	private readonly IPublicationStatusTransitionService _Transitions;

	public PublishPublicationJobHandler(
		AppDbContext db,
		IFileStorage fileStorage,
		IPublishProvider publishProvider,
		ISocialSessionProvider socialSessionProvider,
		IPublicationStatusTransitionService transitions
	) {
		this._Db = db;
		this._FileStorage = fileStorage;
		this._PublishProvider = publishProvider;
		this._SocialSessionProvider = socialSessionProvider;
		this._Transitions = transitions;
	}

	public string JobType {
		get { return PublishingJobs.PublishPublicationV1.JobType; }
	}

	public async Task<JobOutcome> HandleAsync(
		JobContext context,
		CancellationToken cancellationToken
	) {
		var payload = context.DeserializePayload<PublishPublicationPayload>();

		var publication = await this._Db.Publication.SingleOrDefaultAsync(
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
		if (!await this._Transitions.MarkInProgressAsync(
				new MarkPublicationInProgressArgs(publicationId, publication.TenantId),
				cancellationToken
			)) {
			return new JobOutcome.Cancelled("publication_not_found");
		}

		var post = await this._Db.Post.SingleOrDefaultAsync(
			candidate => candidate.Id == publication.PostId && !candidate.IsDeleted,
			cancellationToken
		);
		if (post is null) {
			await this._Transitions.MarkFailedAsync(
				new MarkPublicationFailedArgs(
					publicationId,
					publication.TenantId,
					"the post behind this publication no longer exists",
					PublicationFailureCategory.FixContent
				),
				cancellationToken
			);
			return JobOutcome.Succeeded;
		}

		var assets = await this._Db.PostMediaAsset
			.AsNoTracking()
			.Where(media => media.PostId == post.Id && !media.IsDeleted)
			.OrderBy(media => media.Position)
			.ToListAsync(cancellationToken);

		// Thread follow-ups and the segments an earlier attempt already published
		// (#2171): the chain resumes after the last stored one, never republishing.
		var followUps = await ThreadSegments.FollowUpBodiesAsync(
			this._Db, post.GetRequiredId(), cancellationToken
		);
		var storedResults = await this._Db.PublicationSegmentResult
			.AsNoTracking()
			.Where(result => result.PublicationId == publicationId && !result.IsDeleted)
			.OrderBy(result => result.SegmentPosition)
			.ToListAsync(cancellationToken);
		var completedSegments = storedResults
			.Select(result => new CompletedSegment(
				result.SegmentPosition,
				result.ExternalRecordId,
				result.ExternalCid,
				result.ExternalUrl
			))
			.ToList();
		var totalSegments = followUps.Count + 1;
		var publishedNow = 0;

		// Re-validate at dispatch (issue #2169): a body edited after scheduling may
		// no longer fit the provider. Fails the publication with a plain content
		// cause BEFORE any session/provider call.
		var targetAccount = await this._Db.SocialAccount
			.AsNoTracking()
			.Where(candidate => candidate.Id == publication.SocialAccountId && !candidate.IsDeleted)
			.SingleOrDefaultAsync(cancellationToken);
		if (targetAccount is not null) {
			var contentFailure = PublishValidationService.Validate(
				post.Body,
				assets.Select(asset => asset.ContentType).ToList(),
				[ProviderCapabilityRegistry.Resolve(targetAccount, DateTime.UtcNow)],
				followUps
			);
			if (contentFailure is not null) {
				await this._Transitions.MarkFailedAsync(
					new MarkPublicationFailedArgs(
						publicationId,
						publication.TenantId,
						$"the post can no longer be published: {contentFailure.Cause}",
						PublicationFailureCategory.FixContent
					),
					cancellationToken
				);
				return JobOutcome.Succeeded;
			}
		}

		// Resolve the image bytes before touching the account: a file gone from
		// storage is a content failure naming the image, never retried (#2170).
		var media = new List<PublishMedia>(assets.Count);
		var rootAlreadyPublished = completedSegments.Any(segment => segment.Position == 0);
		for (var index = 0; !rootAlreadyPublished && index < assets.Count; index++) {
			var content = await this._FileStorage.ReadAsync(
				assets[index].RelativePath, cancellationToken
			);
			if (content is null) {
				await this._Transitions.MarkFailedAsync(
					new MarkPublicationFailedArgs(
						publicationId,
						publication.TenantId,
						$"image {index + 1} is no longer available",
						PublicationFailureCategory.FixContent
					),
					cancellationToken
				);
				return JobOutcome.Succeeded;
			}

			media.Add(new PublishMedia {
				Content = content,
				ContentType = assets[index].ContentType,
				AltText = assets[index].AltText,
				WidthPx = assets[index].WidthPx,
				HeightPx = assets[index].HeightPx,
			});
		}

		var sessionResult = await this._SocialSessionProvider.OpenSessionAsync(
			publication.SocialAccountId, cancellationToken
		);
		if (sessionResult is SocialSessionResult.AccountFailure sessionAccount) {
			await this._PauseForAccountAsync(publication, sessionAccount.Cause, cancellationToken);
			return JobOutcome.Succeeded;
		}

		if (sessionResult is SocialSessionResult.Transient sessionTransient) {
			return await this._FailTransientAsync(
				publication, sessionTransient.Cause, context, cancellationToken
			);
		}

		if (sessionResult is not SocialSessionResult.Opened opened) {
			throw new InvalidOperationException(
				$"Unhandled SocialSessionResult kind '{sessionResult.GetType().Name}'."
			);
		}

		var result = await this._PublishProvider.PublishAsync(
			new PublishRequest {
				PublicationId = publicationId,
				IdempotencyKey = publication.IdempotencyKey,
				PostBody = TextCounter.Normalize(post.Body),
				ScheduledAtUtc = publication.ScheduledAtUtc,
				Session = opened.Session,
				Media = media,
				FollowUpSegments = followUps.Select(TextCounter.Normalize).ToList(),
				CompletedSegments = completedSegments,
				OnSegmentCompleted = async (segment, token) => {
					this._Db.PublicationSegmentResult.Add(new PublicationSegmentResult {
						TenantId = publication.TenantId,
						PublicationId = publicationId,
						SegmentPosition = segment.Position,
						ExternalRecordId = segment.RecordId,
						ExternalCid = segment.Cid,
						ExternalUrl = segment.RecordUrl,
					});
					await this._Db.SaveChangesAsync(token);
					publishedNow += 1;
				},
			},
			cancellationToken
		);

		var progress = PublishPublicationJobHandler._ProgressPrefix(
			completedSegments.Count + publishedNow, totalSegments
		);
		switch (result) {
			case PublishResult.Published published:
				return await this._SucceedAsync(publication, published.RecordId, published.RecordUrl, cancellationToken);
			case PublishResult.AlreadyExistsTreatedAsPublished alreadyExists:
				return await this._SucceedAsync(publication, alreadyExists.RecordId, alreadyExists.RecordUrl, cancellationToken);
			case PublishResult.ContentFailure content:
				await this._Transitions.MarkFailedAsync(
					new MarkPublicationFailedArgs(
						publicationId,
						publication.TenantId,
						$"{progress}Bluesky refused the content: {content.Cause}",
						PublicationFailureCategory.FixContent
					),
					cancellationToken
				);
				return JobOutcome.Succeeded;
			case PublishResult.AccountFailure account:
				await this._PauseForAccountAsync(publication, progress + account.Cause, cancellationToken);
				return JobOutcome.Succeeded;
			case PublishResult.TransientFailure transient:
				return await this._FailTransientAsync(publication, progress + transient.Cause, context, cancellationToken);
			default:
				throw new InvalidOperationException(
					$"Unhandled PublishResult kind '{result.GetType().Name}'."
				);
		}
	}

	/// <summary>
	/// "Published 2 of 5 segments; segment 3 failed: " for a thread, empty for a
	/// plain post so single-segment causes stay exactly as before (#2171).
	/// </summary>
	private static string _ProgressPrefix(int published, int total) {
		return total > 1
			? $"Published {published} of {total} segments; segment {published + 1} failed: "
			: string.Empty;
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
		var publication = await this._Db.Publication.SingleOrDefaultAsync(
			candidate => candidate.Id == payload.PublicationId && !candidate.IsDeleted,
			cancellationToken
		);
		if (publication is null || publication.Status != PublicationStatus.Failed) {
			return;
		}

		var cause =
			$"publishing kept failing; reconnect the account. Last cause: "
				+ $"{LastErrorSanitiser.Sanitize(context.LastError ?? "unknown error")}";
		await this._FlagAccountNeedsReconnectAsync(publication.SocialAccountId, cause, cancellationToken);
	}

	private async Task<JobOutcome> _SucceedAsync(
		Publication publication,
		string recordId,
		string recordUrl,
		CancellationToken cancellationToken
	) {
		await this._Transitions.MarkPublishedAsync(
			new MarkPublicationPublishedArgs(
				publication.GetRequiredId(),
				publication.TenantId,
				recordId,
				recordUrl
			),
			cancellationToken
		);
		await this._StampAccountLastSuccessAsync(publication.SocialAccountId, cancellationToken);
		return JobOutcome.Succeeded;
	}

	private async Task _PauseForAccountAsync(
		Publication publication,
		string rawCause,
		CancellationToken cancellationToken
	) {
		var cause =
			$"the social account needs reconnecting: "
				+ $"{LastErrorSanitiser.Sanitize(rawCause) ?? rawCause}";
		await this._Transitions.MarkPausedAsync(
			new MarkPublicationPausedArgs(
				publication.GetRequiredId(),
				publication.TenantId,
				cause
			),
			cancellationToken
		);
		await this._FlagAccountNeedsReconnectAsync(publication.SocialAccountId, cause, cancellationToken);

		// C4: sibling-pause sweep — the account's other scheduled rows must not sit
		// queued behind broken credentials. Same sanitised cause everywhere. All moves
		// go through the transition service, so the architecture writer-scan stays green.
		var siblings = await this._Db.Publication
			.Where(p => p.SocialAccountId == publication.SocialAccountId
				&& p.TenantId == publication.TenantId
				&& p.Status == PublicationStatus.Scheduled)
			.ToListAsync(cancellationToken);
		foreach (var sibling in siblings) {
			await this._Transitions.MarkPausedAsync(
				new MarkPublicationPausedArgs(
					sibling.GetRequiredId(),
					publication.TenantId,
					cause
				),
				cancellationToken
			);
		}
	}

	private async Task<JobOutcome> _FailTransientAsync(
		Publication publication,
		string rawCause,
		JobContext context,
		CancellationToken cancellationToken
	) {
		var cause = LastErrorSanitiser.Sanitize(rawCause) ?? rawCause;
		if (context.Attempts + 1 >= context.MaxAttempts) {
			await this._Transitions.MarkFailedAsync(
				new MarkPublicationFailedArgs(
					publication.GetRequiredId(),
					publication.TenantId,
					$"publishing did not succeed after {context.MaxAttempts} attempts: {cause}",
					PublicationFailureCategory.RetryLater
				),
				cancellationToken
			);
			return new JobOutcome.PermanentFailure(
				$"publishing gave up after {context.MaxAttempts} attempts: {cause}"
			);
		}

		return new JobOutcome.Retry(Error: cause);
	}

	private async Task _StampAccountLastSuccessAsync(
		Guid socialAccountId,
		CancellationToken cancellationToken
	) {
		var account = await this._Db.SocialAccount.SingleOrDefaultAsync(
			candidate => candidate.Id == socialAccountId && !candidate.IsDeleted,
			cancellationToken
		);
		if (account is null) {
			return;
		}

		account.LastSuccessAt = DateTime.UtcNow;
		await this._Db.SaveChangesAsync(cancellationToken);
	}

	private async Task _FlagAccountNeedsReconnectAsync(
		Guid socialAccountId,
		string sanitisedCause,
		CancellationToken cancellationToken
	) {
		var account = await this._Db.SocialAccount.SingleOrDefaultAsync(
			candidate => candidate.Id == socialAccountId && !candidate.IsDeleted,
			cancellationToken
		);
		// A disconnect the user chose (Revoked) is never downgraded to NeedsReconnect.
		if (account is null || account.Status == SocialAccountStatus.Revoked) {
			return;
		}

		account.Status = SocialAccountStatus.NeedsReconnect;
		account.LastError = sanitisedCause;
		await this._Db.SaveChangesAsync(cancellationToken);
	}
}
