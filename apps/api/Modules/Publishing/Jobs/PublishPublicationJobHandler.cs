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

	/// <summary>Mutable state one run of <see cref="HandleAsync"/> threads through its steps.</summary>
	// Publication, Effective and Session are assigned by the first steps before any later step reads them.
#pragma warning disable CS8618
	private sealed class _Run {
		public Publication Publication { get; set; }
		public Guid PublicationId { get; set; }
		public EffectiveContent Effective { get; set; }
		public List<CompletedSegment> Completed { get; set; } = [];
		public int Total { get; set; }
		public SocialAccount? Account { get; set; }
		public List<List<PublishMedia>> Media { get; set; } = [];
		public SocialSession Session { get; set; }
		public List<string> Texts { get; set; } = [];
		public int? ResendPosition { get; set; }
		public int PublishedNow { get; set; }
		public Guid? OpenAttempt { get; set; }

		public SocialProvider Provider {
			get { return this.Account?.Provider ?? SocialProvider.Bluesky; }
		}
	}
#pragma warning restore CS8618

	public async Task<JobOutcome> HandleAsync(
		JobContext context,
		CancellationToken cancellationToken
	) {
		var run = new _Run();
		var stop = await this._StartAsync(run, context, cancellationToken);
		stop ??= await this._ResolveContentAsync(run, cancellationToken);
		stop ??= await this._PrecheckAsync(run, cancellationToken);
		stop ??= await this._LoadMediaAsync(run, cancellationToken);
		stop ??= await this._OpenSessionAsync(run, context, cancellationToken);
		stop ??= await this._ReconcileEarlierWritesAsync(run, context, cancellationToken);
		return stop ?? await this._PublishAsync(run, context, cancellationToken);
	}

	private async Task<JobOutcome?> _StartAsync(
		_Run run,
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

		run.Publication = publication;
		run.PublicationId = publication.GetRequiredId();
		if (!await this._Transitions.MarkInProgressAsync(
				new MarkPublicationInProgressArgs(run.PublicationId, publication.TenantId),
				cancellationToken
			)) {
			return new JobOutcome.Cancelled("publication_not_found");
		}

		return null;
	}

	private async Task<JobOutcome?> _ResolveContentAsync(
		_Run run,
		CancellationToken cancellationToken
	) {
		var publication = run.Publication;
		var post = await this._Db.Post.SingleOrDefaultAsync(
			candidate => candidate.Id == publication.PostId && !candidate.IsDeleted,
			cancellationToken
		);
		if (post is null) {
			await this._FailOrParkAsync(
				new MarkPublicationFailedArgs(
					run.PublicationId,
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
		run.Effective = await RenditionResolver.ResolveForPublicationAsync(
			this._Db, run.PublicationId, post, cancellationToken
		);
		var storedResults = await this._Db.PublicationSegmentResult
			.AsNoTracking()
			.Where(result => result.PublicationId == run.PublicationId && !result.IsDeleted)
			.OrderBy(result => result.SegmentPosition)
			.ToListAsync(cancellationToken);
		run.Completed = storedResults
			.Select(result => new CompletedSegment(
				result.SegmentPosition,
				result.ExternalRecordId,
				result.ExternalCid,
				result.ExternalUrl
			))
			.ToList();
		run.Total = run.Effective.FollowUps.Count + 1;

		run.Account = await this._Db.SocialAccount
			.AsNoTracking()
			.Where(candidate => candidate.Id == publication.SocialAccountId && !candidate.IsDeleted)
			.SingleOrDefaultAsync(cancellationToken);
		return null;
	}

	/// <summary>
	/// Re-validate at dispatch (issue #2169): a body edited after scheduling may no longer
	/// fit the provider. Fails the publication with a plain content cause BEFORE any
	/// session/provider call.
	/// </summary>
	private async Task<JobOutcome?> _PrecheckAsync(
		_Run run,
		CancellationToken cancellationToken
	) {
		var targetAccount = run.Account;
		if (targetAccount is null) {
			return null;
		}

		if (!this._ProviderAvailability.IsEnabled(targetAccount.Provider)) {
			// The operator switched the provider off (#2184): nothing is sent. A plain
			// retry works once it is enabled again.
			return await this._FailRunAsync(
				run,
				$"{PublishPublicationJobHandler._ProgressPrefix(run.Completed.Count, run.Total)}"
					+ $"{SocialAccountWire.FormatProviderLabel(targetAccount.Provider)} publishing is disabled by the operator; retry once it is enabled again",
				PublicationFailureCategory.RetryLater,
				cancellationToken
			);
		}

		var effective = run.Effective;
		var contentFailure = PublishValidationService.Validate(
			effective.Body,
			effective.ImageContentTypes,
			[ProviderCapabilityRegistry.Resolve(targetAccount)],
			effective.FollowUps,
			effective.ImageAltTexts,
			effective.FollowUpImageContentTypes
		);
		if (contentFailure is null) {
			return null;
		}

		return await this._FailRunAsync(
			run,
			$"the post can no longer be published: {contentFailure.Cause}",
			PublicationFailureCategory.FixContent,
			cancellationToken
		);
	}

	private async Task<JobOutcome> _FailRunAsync(
		_Run run,
		string cause,
		PublicationFailureCategory category,
		CancellationToken cancellationToken
	) {
		await this._FailOrParkAsync(
			new MarkPublicationFailedArgs(run.PublicationId, run.Publication.TenantId, cause, category),
			cancellationToken
		);
		return JobOutcome.Succeeded;
	}

	/// <summary>
	/// Resolve the image bytes before touching the account: a file gone from
	/// storage is a content failure naming the image, never retried (#2170).
	/// Segments a previous attempt already published are never sent again: their
	/// images are not read either.
	/// </summary>
	private async Task<JobOutcome?> _LoadMediaAsync(
		_Run run,
		CancellationToken cancellationToken
	) {
		var publishedPositions = run.Completed.Select(segment => segment.Position).ToHashSet();
		for (var position = 0; position < run.Total; position++) {
			var segmentMedia = new List<PublishMedia>();
			run.Media.Add(segmentMedia);
			if (publishedPositions.Contains(position)) {
				continue;
			}

			var missing = await this._ReadSegmentImagesAsync(run, position, segmentMedia, cancellationToken);
			if (missing is not null) {
				return await this._FailRunAsync(
					run, missing, PublicationFailureCategory.FixContent, cancellationToken
				);
			}
		}

		return null;
	}

	/// <summary>Reads one segment's images into <paramref name="into"/>; returns the failure cause when one is gone.</summary>
	private async Task<string?> _ReadSegmentImagesAsync(
		_Run run,
		int position,
		List<PublishMedia> into,
		CancellationToken cancellationToken
	) {
		var segmentAssets = run.Effective.ImagesAt(position);
		for (var index = 0; index < segmentAssets.Count; index++) {
			var content = await this._FileStorage.ReadAsync(
				segmentAssets[index].RelativePath, cancellationToken
			);
			if (content is null) {
				return position == 0
					? $"image {index + 1} is no longer available"
					: $"image {index + 1} of segment {position + 1} is no longer available";
			}

			into.Add(new PublishMedia {
				Content = content,
				ContentType = segmentAssets[index].ContentType,
				AltText = segmentAssets[index].AltText,
				WidthPx = segmentAssets[index].WidthPx,
				HeightPx = segmentAssets[index].HeightPx,
			});
		}

		return null;
	}

	private async Task<JobOutcome?> _OpenSessionAsync(
		_Run run,
		JobContext context,
		CancellationToken cancellationToken
	) {
		var publication = run.Publication;
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

		run.Session = opened.Session;
		run.Texts = run.Effective.Texts.Select(TextCounter.Normalize).ToList();
		return null;
	}

	private async Task<JobOutcome?> _ReconcileEarlierWritesAsync(
		_Run run,
		JobContext context,
		CancellationToken cancellationToken
	) {
		// A journal row that never resolved means an earlier write may have landed
		// (timeout, crash, stale-job recovery): look BEFORE writing again (#2176).
		var unresolved = await this._FindUnresolvedAsync(run.PublicationId, cancellationToken);
		if (unresolved is not null) {
			return await this._ReconcileUnresolvedAsync(run, unresolved, context, cancellationToken);
		}

		// A re-issued publication has a NEW key: a write the failed one made but never
		// recorded would be sent again under it. Look under the old key first (#2181).
		return await this._ReconcilePredecessorAsync(
			run.Publication,
			run.Session,
			run.Provider,
			run.Texts,
			run.Completed,
			context,
			cancellationToken
		);
	}

	private async Task<JobOutcome?> _ReconcileUnresolvedAsync(
		_Run run,
		UnresolvedAttempt unresolved,
		JobContext context,
		CancellationToken cancellationToken
	) {
		var publication = run.Publication;
		var reconciled = await this._PublishProvider.ReconcileAsync(
			new ReconcileRequest {
				PublicationId = run.PublicationId,
				IdempotencyKey = unresolved.IdempotencyKey,
				SegmentPosition = unresolved.SegmentPosition,
				Session = run.Session,
				Provider = run.Provider,
				FirstAttemptAtUtc = unresolved.FirstAttemptAtUtc,
				ExpectedText = unresolved.SegmentPosition < run.Texts.Count
					? run.Texts[unresolved.SegmentPosition]
					: null,
			},
			cancellationToken
		);
		switch (reconciled) {
			case ReconcileResult.Found found:
				await this._AdoptFoundSegmentAsync(
					publication, unresolved.Id, found.Segment, cancellationToken
				);
				run.Completed.RemoveAll(segment => segment.Position == found.Segment.Position);
				run.Completed.Add(found.Segment);
				return null;
			case ReconcileResult.SafeToResend:
				await this._Journal.SupersedeUnresolvedAsync(run.PublicationId, cancellationToken);
				run.ResendPosition = unresolved.SegmentPosition;
				return null;
			case ReconcileResult.NeedsReview review:
				await this._ParkForReviewAsync(run.PublicationId, publication.TenantId, review.Cause, cancellationToken);
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

	private async Task<JobOutcome> _PublishAsync(
		_Run run,
		JobContext context,
		CancellationToken cancellationToken
	) {
		var publication = run.Publication;
		var targetAccount = run.Account;
		var result = await this._PublishProvider.PublishAsync(
			new PublishRequest {
				PublicationId = run.PublicationId,
				IdempotencyKey = publication.IdempotencyKey,
				PostBody = run.Texts[0],
				ScheduledAtUtc = publication.ScheduledAtUtc,
				Session = run.Session,
				Provider = run.Provider,
				Capability = targetAccount is null ? null : ProviderCapabilityRegistry.Resolve(targetAccount),
				Visibility = targetAccount?.DefaultVisibility ?? SocialPostVisibility.Public,
				Media = run.Media[0],
				FollowUpMedia = run.Media.Skip(1)
					.Select(set => (IReadOnlyList<PublishMedia>)set)
					.ToList(),
				FollowUpSegments = run.Texts.Skip(1).ToList(),
				CompletedSegments = run.Completed,
				ResendPosition = run.ResendPosition,
				OnBeforeWrite = (position, token) => this._BeginAttemptAsync(run, position, token),
				OnSegmentCompleted = (segment, token) => this._RecordSegmentAsync(run, segment, token),
			},
			cancellationToken
		);
		await this._ResolveOpenAttemptAsync(run.OpenAttempt, result, cancellationToken);

		var progress = PublishPublicationJobHandler._ProgressPrefix(
			run.Completed.Count + run.PublishedNow, run.Total
		);
		return await this._MapResultAsync(run, result, progress, context, cancellationToken);
	}

	private async Task _BeginAttemptAsync(_Run run, int position, CancellationToken token) {
		var publication = run.Publication;
		run.OpenAttempt = await this._Journal.BeginAsync(
			new BeginPublishAttemptArgs(
				publication.TenantId,
				run.PublicationId,
				position,
				publication.Attempts,
				PublishAttemptJournal.Fingerprint(
					run.Texts[position],
					run.Effective.ImagesAt(position).Select(asset => asset.Id)
				),
				publication.IdempotencyKey
			),
			token
		);
	}

	private async Task _RecordSegmentAsync(_Run run, CompletedSegment segment, CancellationToken token) {
		this._Db.PublicationSegmentResult.Add(new PublicationSegmentResult {
			TenantId = run.Publication.TenantId,
			PublicationId = run.PublicationId,
			SegmentPosition = segment.Position,
			ExternalRecordId = segment.RecordId,
			ExternalCid = segment.Cid,
			ExternalUrl = segment.RecordUrl,
		});
		await this._Db.SaveChangesAsync(token);
		run.PublishedNow += 1;
		if (run.OpenAttempt is { } done) {
			await this._Journal.ResolveAsync(
				new ResolvePublishAttemptArgs(
					done, SubmissionState.Accepted, segment.RecordId, segment.RecordUrl
				),
				token
			);
			run.OpenAttempt = null;
		}
	}

	private async Task<JobOutcome> _MapResultAsync(
		_Run run,
		PublishResult result,
		string progress,
		JobContext context,
		CancellationToken cancellationToken
	) {
		var publication = run.Publication;
		switch (result) {
			case PublishResult.Published published:
				return await this._SucceedAsync(publication, published.RecordId, published.RecordUrl, cancellationToken);
			case PublishResult.AlreadyExistsTreatedAsPublished alreadyExists:
				return await this._SucceedAsync(publication, alreadyExists.RecordId, alreadyExists.RecordUrl, cancellationToken);
			case PublishResult.ContentFailure content:
				return await this._FailRunAsync(
					run,
					$"{progress}{PublishPublicationJobHandler._ProviderName(run.Account)} refused the content: {content.Cause}",
					PublicationFailureCategory.FixContent,
					cancellationToken
				);
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
			// A status is confirmed live: a re-issue must still look for it, never post again.
			PublishResult.ContentFailure { StatusExists: true } => (SubmissionState.Unknown, null, null),
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
