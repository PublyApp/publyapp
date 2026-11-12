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
	private readonly IPublishAttemptJournal _Journal;
	private readonly IProviderAvailability _ProviderAvailability;

	public PublishPublicationJobHandler(
		AppDbContext db,
		IFileStorage fileStorage,
		IPublishProvider publishProvider,
		ISocialSessionProvider socialSessionProvider,
		IPublicationStatusTransitionService transitions,
		IPublishAttemptJournal journal,
		IProviderAvailability providerAvailability
	) {
		this._Db = db;
		this._FileStorage = fileStorage;
		this._PublishProvider = publishProvider;
		this._SocialSessionProvider = socialSessionProvider;
		this._Transitions = transitions;
		this._Journal = journal;
		this._ProviderAvailability = providerAvailability;
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
			await this._FailOrParkAsync(
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

		// The EFFECTIVE content of this destination (post + its rendition, #2172): every
		// text, image and alt text below comes from here, never from the post directly.
		var effective = await RenditionResolver.ResolveForPublicationAsync(
			this._Db, publication.TenantId, publicationId, post, cancellationToken
		);
		var followUps = effective.FollowUps;
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
		if (targetAccount is not null && !this._ProviderAvailability.IsEnabled(targetAccount.Provider)) {
			// The operator switched the provider off (#2184): nothing is sent. A plain
			// retry works once it is enabled again.
			await this._FailOrParkAsync(
				new MarkPublicationFailedArgs(
					publicationId,
					publication.TenantId,
					$"{PublishPublicationJobHandler._ProgressPrefix(completedSegments.Count, totalSegments)}"
						+ $"{SocialAccountWire.FormatProviderLabel(targetAccount.Provider)} publishing is disabled by the operator; retry once it is enabled again",
					PublicationFailureCategory.RetryLater
				),
				cancellationToken
			);
			return JobOutcome.Succeeded;
		}

		if (targetAccount is not null) {
			var contentFailure = PublishValidationService.Validate(
				effective.Body,
				effective.ImageContentTypes,
				[ProviderCapabilityRegistry.Resolve(targetAccount)],
				followUps,
				effective.ImageAltTexts,
				effective.FollowUpImageContentTypes
			);
			if (contentFailure is not null) {
				await this._FailOrParkAsync(
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
		// Segments a previous attempt already published are never sent again: their
		// images are not read either.
		var publishedPositions = completedSegments.Select(segment => segment.Position).ToHashSet();
		var mediaBySegment = new List<List<PublishMedia>>(totalSegments);
		for (var position = 0; position < totalSegments; position++) {
			var segmentMedia = new List<PublishMedia>();
			mediaBySegment.Add(segmentMedia);
			if (publishedPositions.Contains(position)) {
				continue;
			}

			var segmentAssets = effective.ImagesAt(position);
			for (var index = 0; index < segmentAssets.Count; index++) {
				var content = await this._FileStorage.ReadAsync(
					segmentAssets[index].RelativePath, cancellationToken
				);
				if (content is null) {
					await this._FailOrParkAsync(
						new MarkPublicationFailedArgs(
							publicationId,
							publication.TenantId,
							position == 0
								? $"image {index + 1} is no longer available"
								: $"image {index + 1} of segment {position + 1} is no longer available",
							PublicationFailureCategory.FixContent
						),
						cancellationToken
					);
					return JobOutcome.Succeeded;
				}

				segmentMedia.Add(new PublishMedia {
					Content = content,
					ContentType = segmentAssets[index].ContentType,
					AltText = segmentAssets[index].AltText,
					WidthPx = segmentAssets[index].WidthPx,
					HeightPx = segmentAssets[index].HeightPx,
				});
			}
		}

		var media = mediaBySegment[0];

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

		var effectiveTexts = effective.Texts.Select(TextCounter.Normalize).ToList();

		// A journal row that never resolved means an earlier write may have landed
		// (timeout, crash, stale-job recovery): look BEFORE writing again (#2176).
		var unresolved = await this._FindUnresolvedAsync(publicationId, cancellationToken);
		int? resendPosition = null;
		if (unresolved is not null) {
			var reconciled = await this._PublishProvider.ReconcileAsync(
				new ReconcileRequest {
					PublicationId = publicationId,
					IdempotencyKey = unresolved.IdempotencyKey,
					SegmentPosition = unresolved.SegmentPosition,
					Session = opened.Session,
					Provider = targetAccount?.Provider ?? SocialProvider.Bluesky,
					FirstAttemptAtUtc = unresolved.FirstAttemptAtUtc,
					ExpectedText = unresolved.SegmentPosition < effectiveTexts.Count
						? effectiveTexts[unresolved.SegmentPosition]
						: null,
				},
				cancellationToken
			);
			switch (reconciled) {
				case ReconcileResult.Found found:
					await this._AdoptFoundSegmentAsync(
						publication, unresolved.Id, found.Segment, cancellationToken
					);
					completedSegments.RemoveAll(segment => segment.Position == found.Segment.Position);
					completedSegments.Add(found.Segment);
					break;
				case ReconcileResult.SafeToResend:
					await this._Journal.SupersedeUnresolvedAsync(publicationId, cancellationToken);
					resendPosition = unresolved.SegmentPosition;
					break;
				case ReconcileResult.NeedsReview review:
					await this._ParkForReviewAsync(publicationId, publication.TenantId, review.Cause, cancellationToken);
					return JobOutcome.Succeeded;
				case ReconcileResult.Unavailable unavailable:
					return await this._RetryUnresolvedAsync(
						publication, unavailable.Cause, context, cancellationToken, null
					);
				default:
					throw new InvalidOperationException(
						$"Unhandled ReconcileResult kind '{reconciled.GetType().Name}'."
					);
			}
		}

		// A re-issued publication has a NEW key: a write the failed one made but never
		// recorded would be sent again under it. Look under the old key first (#2181).
		if (unresolved is null) {
			var predecessor = await this._ReconcilePredecessorAsync(
				publication,
				opened.Session,
				targetAccount?.Provider ?? SocialProvider.Bluesky,
				effectiveTexts,
				completedSegments,
				context,
				cancellationToken
			);
			if (predecessor is not null) {
				return predecessor;
			}
		}

		Guid? openAttempt = null;
		var result = await this._PublishProvider.PublishAsync(
			new PublishRequest {
				PublicationId = publicationId,
				IdempotencyKey = publication.IdempotencyKey,
				PostBody = effectiveTexts[0],
				ScheduledAtUtc = publication.ScheduledAtUtc,
				Session = opened.Session,
				Provider = targetAccount?.Provider ?? SocialProvider.Bluesky,
				Capability = targetAccount is null ? null : ProviderCapabilityRegistry.Resolve(targetAccount),
				Visibility = targetAccount?.DefaultVisibility ?? SocialPostVisibility.Public,
				Media = media,
				FollowUpMedia = mediaBySegment.Skip(1)
					.Select(set => (IReadOnlyList<PublishMedia>)set)
					.ToList(),
				FollowUpSegments = effectiveTexts.Skip(1).ToList(),
				CompletedSegments = completedSegments,
				ResendPosition = resendPosition,
				OnBeforeWrite = async (position, token) => {
					openAttempt = await this._Journal.BeginAsync(
						new BeginPublishAttemptArgs(
							publication.TenantId,
							publicationId,
							position,
							publication.Attempts,
							PublishAttemptJournal.Fingerprint(
								effectiveTexts[position],
								effective.ImagesAt(position).Select(asset => asset.Id)
							),
							publication.IdempotencyKey
						),
						token
					);
				},
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
					if (openAttempt is { } done) {
						await this._Journal.ResolveAsync(
							new ResolvePublishAttemptArgs(
								done, SubmissionState.Accepted, segment.RecordId, segment.RecordUrl
							),
							token
						);
						openAttempt = null;
					}
				},
			},
			cancellationToken
		);
		await this._ResolveOpenAttemptAsync(openAttempt, result, cancellationToken);

		var progress = PublishPublicationJobHandler._ProgressPrefix(
			completedSegments.Count + publishedNow, totalSegments
		);
		switch (result) {
			case PublishResult.Published published:
				return await this._SucceedAsync(publication, published.RecordId, published.RecordUrl, cancellationToken);
			case PublishResult.AlreadyExistsTreatedAsPublished alreadyExists:
				return await this._SucceedAsync(publication, alreadyExists.RecordId, alreadyExists.RecordUrl, cancellationToken);
			case PublishResult.ContentFailure content:
				await this._FailOrParkAsync(
					new MarkPublicationFailedArgs(
						publicationId,
						publication.TenantId,
						$"{progress}{PublishPublicationJobHandler._ProviderName(targetAccount)} refused the content: {content.Cause}",
						PublicationFailureCategory.FixContent
					),
					cancellationToken
				);
				return JobOutcome.Succeeded;
			case PublishResult.AccountFailure account:
				await this._PauseForAccountAsync(publication, progress + account.Cause, cancellationToken);
				return JobOutcome.Succeeded;
			case PublishResult.Ambiguous ambiguous:
				return await this._RetryUnresolvedAsync(
					publication, progress + ambiguous.Cause, context, cancellationToken, ambiguous.RetryAfter
				);
			case PublishResult.TransientFailure transient:
				return await this._FailTransientAsync(
					publication, progress + transient.Cause, context, cancellationToken, transient.RetryAfter
				);
			default:
				throw new InvalidOperationException(
					$"Unhandled PublishResult kind '{result.GetType().Name}'."
				);
		}
	}

	/// <summary>
	/// For the next segment to write, asks the provider about the writes that earlier,
	/// failed publications of the same post and account may have made under THEIR keys
	/// without ever recording them (journal rows still NotSent, Unknown or Superseded, with
	/// no stored result): a record found is adopted as this publication's segment, an absent
	/// one is safe to write, and an uncertain answer parks the publication for review
	/// instead of risking a duplicate. Returns the job outcome when the run must stop here.
	/// </summary>
	private async Task<JobOutcome?> _ReconcilePredecessorAsync(
		Publication publication,
		SocialSession session,
		SocialProvider provider,
		IReadOnlyList<string> effectiveTexts,
		List<CompletedSegment> completedSegments,
		JobContext context,
		CancellationToken cancellationToken
	) {
		var done = completedSegments.Select(segment => segment.Position).ToHashSet();
		var next = 0;
		while (done.Contains(next)) {
			next += 1;
		}

		if (next >= effectiveTexts.Count) {
			return null;
		}

		var publicationId = publication.GetRequiredId();
		var attempts = await (
			from attempt in this._Db.PublishAttempt.AsNoTracking()
			join earlier in this._Db.Publication.AsNoTracking()
				on attempt.PublicationId equals earlier.Id
			where earlier.PostId == publication.PostId
				&& earlier.SocialAccountId == publication.SocialAccountId
				&& earlier.TenantId == publication.TenantId
				&& earlier.Id != publicationId
				&& earlier.CreatedAt < publication.CreatedAt
				&& (earlier.Status == PublicationStatus.Failed || earlier.IsDeleted)
				&& attempt.SegmentPosition == next
				&& !attempt.IsDeleted
			select attempt
		).ToListAsync(cancellationToken);
		var recorded = await (
			from result in this._Db.PublicationSegmentResult.AsNoTracking()
			where result.SegmentPosition == next
				&& !result.IsDeleted
				&& attempts.Select(attempt => attempt.PublicationId).Contains(result.PublicationId)
			select result.PublicationId
		).ToListAsync(cancellationToken);
		var suspicious = attempts
			.Where(attempt => attempt.SubmissionState is SubmissionState.NotSent
					or SubmissionState.Unknown
					or SubmissionState.Superseded
				&& !recorded.Contains(attempt.PublicationId))
			.GroupBy(attempt => attempt.IdempotencyKey)
			.Select(group => new {
				Key = group.Key,
				First = group.Min(attempt => attempt.CreatedAt),
			})
			.OrderBy(entry => entry.First)
			.ToList();
		foreach (var entry in suspicious) {
			var reconciled = await this._PublishProvider.ReconcileAsync(
				new ReconcileRequest {
					PublicationId = publicationId,
					IdempotencyKey = entry.Key,
					SegmentPosition = next,
					Session = session,
					Provider = provider,
					FirstAttemptAtUtc = entry.First,
					ExpectedText = effectiveTexts[next],
					ResendUnderNewKey = true,
				},
				cancellationToken
			);
			switch (reconciled) {
				case ReconcileResult.Found found:
					this._Db.PublicationSegmentResult.Add(new PublicationSegmentResult {
						TenantId = publication.TenantId,
						PublicationId = publicationId,
						SegmentPosition = found.Segment.Position,
						ExternalRecordId = found.Segment.RecordId,
						ExternalCid = found.Segment.Cid,
						ExternalUrl = found.Segment.RecordUrl,
					});
					await this._Db.SaveChangesAsync(cancellationToken);
					completedSegments.Add(found.Segment);
					return null;
				case ReconcileResult.SafeToResend:
					break;
				case ReconcileResult.NeedsReview review:
					await this._ParkForReviewAsync(
						publicationId, publication.TenantId, review.Cause, cancellationToken
					);
					return JobOutcome.Succeeded;
				case ReconcileResult.Unavailable unavailable:
					return await this._RetryUnresolvedAsync(
						publication, unavailable.Cause, context, cancellationToken, null
					);
				default:
					throw new InvalidOperationException(
						$"Unhandled ReconcileResult kind '{reconciled.GetType().Name}'."
					);
			}
		}

		return null;
	}

	/// <summary>Records how the write that was just attempted ended, on its journal row.</summary>
	private async Task _ResolveOpenAttemptAsync(
		Guid? attemptId,
		PublishResult result,
		CancellationToken cancellationToken
	) {
		if (attemptId is not { } id) {
			return;
		}

		(SubmissionState state, string? recordId, string? recordUrl) = result switch {
			PublishResult.Published published =>
				(SubmissionState.Accepted, published.RecordId, published.RecordUrl),
			PublishResult.AlreadyExistsTreatedAsPublished existing =>
				(SubmissionState.Accepted, existing.RecordId, existing.RecordUrl),
			PublishResult.Ambiguous => (SubmissionState.Unknown, null, null),
			_ => (SubmissionState.Rejected, null, null),
		};
		await this._Journal.ResolveAsync(
			new ResolvePublishAttemptArgs(id, state, recordId, recordUrl), cancellationToken
		);
	}

	/// <summary>A reconciled segment the provider already holds: store it and move on after it.</summary>
	private async Task _AdoptFoundSegmentAsync(
		Publication publication,
		Guid attemptId,
		CompletedSegment segment,
		CancellationToken cancellationToken
	) {
		var publicationId = publication.GetRequiredId();
		var stored = await this._Db.PublicationSegmentResult.AnyAsync(
			result => result.PublicationId == publicationId
				&& result.SegmentPosition == segment.Position
				&& !result.IsDeleted,
			cancellationToken
		);
		if (!stored) {
			this._Db.PublicationSegmentResult.Add(new PublicationSegmentResult {
				TenantId = publication.TenantId,
				PublicationId = publicationId,
				SegmentPosition = segment.Position,
				ExternalRecordId = segment.RecordId,
				ExternalCid = segment.Cid,
				ExternalUrl = segment.RecordUrl,
			});
		}

		await this._Db.SaveChangesAsync(cancellationToken);
		await this._Journal.ResolveAsync(
			new ResolvePublishAttemptArgs(
				attemptId, SubmissionState.Accepted, segment.RecordId, segment.RecordUrl
			),
			cancellationToken
		);
	}

	/// <summary>
	/// An earlier write is still unresolved (ambiguous answer, or the lookup itself
	/// failed): back off and look again; at the ceiling ask the user — never fail the
	/// publication, since Failed would free its slot for a second delivery.
	/// </summary>
	private async Task<JobOutcome> _RetryUnresolvedAsync(
		Publication publication,
		string rawCause,
		JobContext context,
		CancellationToken cancellationToken,
		TimeSpan? retryAfter
	) {
		var cause = LastErrorSanitiser.Sanitize(rawCause) ?? rawCause;
		if (context.Attempts + 1 >= context.MaxAttempts) {
			await this._ParkForReviewAsync(
				publication.GetRequiredId(), publication.TenantId, cause, cancellationToken
			);
			return JobOutcome.Succeeded;
		}

		return new JobOutcome.Retry(DelayOverride: retryAfter, Error: cause);
	}

	private async Task _ParkForReviewAsync(
		Guid publicationId,
		Guid tenantId,
		string rawCause,
		CancellationToken cancellationToken
	) {
		await this._Transitions.MarkPausedAsync(
			new MarkPublicationPausedArgs(
				publicationId,
				tenantId,
				"it may already be on the provider, so it was not sent again: "
					+ $"{LastErrorSanitiser.Sanitize(rawCause) ?? rawCause}. Check the role, "
					+ "then mark it published or retry",
				PublicationFailureCategory.NeedsReview
			),
			cancellationToken
		);
	}

	/// <summary>
	/// The unresolved journal row that still blocks a write, if any. A row whose
	/// segment already has a stored result was delivered (the worker died between the
	/// two saves): it is closed as Accepted instead of blocking (#2176 F8).
	/// </summary>
	private async Task<UnresolvedAttempt?> _FindUnresolvedAsync(
		Guid publicationId,
		CancellationToken cancellationToken
	) {
		while (true) {
			var unresolved = await this._Journal.FindUnresolvedAsync(publicationId, cancellationToken);
			if (unresolved is null) {
				return null;
			}

			var stored = await this._Db.PublicationSegmentResult
				.AsNoTracking()
				.Where(result => result.PublicationId == publicationId
					&& result.SegmentPosition == unresolved.SegmentPosition
					&& !result.IsDeleted)
				.FirstOrDefaultAsync(cancellationToken);
			if (stored is null) {
				return unresolved;
			}

			await this._Journal.ResolveAsync(
				new ResolvePublishAttemptArgs(
					unresolved.Id, SubmissionState.Accepted, stored.ExternalRecordId, stored.ExternalUrl
				),
				cancellationToken
			);
		}
	}

	/// <summary>
	/// Every Failed move goes through here: Failed frees the (post, account) slot for a
	/// second delivery, so while a write may have landed the publication is parked as
	/// needs review instead. Returns true when it was parked.
	/// </summary>
	private async Task<bool> _FailOrParkAsync(
		MarkPublicationFailedArgs args,
		CancellationToken cancellationToken
	) {
		var unresolved = await this._FindUnresolvedAsync(args.PublicationId, cancellationToken);
		if (unresolved is not null) {
			await this._ParkForReviewAsync(
				args.PublicationId, args.TenantId, args.Cause, cancellationToken
			);
			return true;
		}

		await this._Transitions.MarkFailedAsync(args, cancellationToken);
		return false;
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
		CancellationToken cancellationToken,
		TimeSpan? retryAfter = null
	) {
		var cause = LastErrorSanitiser.Sanitize(rawCause) ?? rawCause;
		if (context.Attempts + 1 >= context.MaxAttempts) {
			var parked = await this._FailOrParkAsync(
				new MarkPublicationFailedArgs(
					publication.GetRequiredId(),
					publication.TenantId,
					$"publishing did not succeed after {context.MaxAttempts} attempts: {cause}",
					PublicationFailureCategory.RetryLater
				),
				cancellationToken
			);
			if (parked) {
				return JobOutcome.Succeeded;
			}

			return new JobOutcome.PermanentFailure(
				$"publishing gave up after {context.MaxAttempts} attempts: {cause}"
			);
		}

		return new JobOutcome.Retry(DelayOverride: retryAfter, Error: cause);
	}

	private static string _ProviderName(SocialAccount? account) {
		return account?.Provider switch {
			null or SocialProvider.Bluesky => "Bluesky",
			SocialProvider.Mastodon => "Mastodon",
			SocialProvider.Pixelfed => "Pixelfed",
			SocialProvider.DiscordWebhook => "Discord",
			_ => throw new ArgumentOutOfRangeException(nameof(account), "Unhandled SocialProvider"),
		};
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
