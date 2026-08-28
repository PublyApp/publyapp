using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Jobs;
using PublyApp.Api.Modules.Publishing.Lib;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Lib;

namespace PublyApp.Api.Modules.Publishing.Services;

public sealed record PublishNowArgs(
	Guid TenantId,
	Guid PostId,
	Guid ActorUserId,
	IReadOnlyList<Guid> SocialAccountIds
);

/// <summary>
/// Outcome of one publish-now request. <see cref="PublishNowResult.Created"/> carries
/// the new publication row ids; every other variant names the refusal cause in plain
/// terms for the handler to map onto RFC 7807 responses.
/// </summary>
public abstract record PublishNowResult {
	public sealed record Created(IReadOnlyList<Guid> PublicationIds) : PublishNowResult;

	// Accounts already holding a live publication for this post (422 upstream).
	// Produced BOTH by the proactive non-terminal live check AND by translating a
	// lost unique-index race inside the transaction, so every caller sees one
	// outcome shape.
	public sealed record LivePublicationsExist(IReadOnlyList<Guid> AccountIds)
		: PublishNowResult;

	public sealed record PostNotFound : PublishNowResult;

	public sealed record AccountsNotFound(IReadOnlyList<Guid> AccountIds)
		: PublishNowResult;
}

/// <summary>
/// Creates one scheduled publication per chosen account and enqueues its delivery
/// job through the trusted boundary — the whole batch in ONE transaction (D2 plan
/// Task 1): a rolled-back domain write takes its already-enqueued jobs with it.
/// Dependencies are infrastructure only (<see cref="AppDbContext"/> +
/// <see cref="IJobEnqueuer"/>); status is NEVER written here — fresh rows are born
/// <see cref="PublicationStatus.Scheduled"/> via the entity default and move only
/// through the transition service.
/// </summary>
public interface IPublishNowService {
	Task<PublishNowResult> PublishNowAsync(
		PublishNowArgs args,
		CancellationToken cancellationToken
	);
}

[Service(ServiceLifetime.Scoped)]
public sealed class PublishNowService : IPublishNowService {
	private readonly AppDbContext _db;
	private readonly IJobEnqueuer _jobEnqueuer;

	public PublishNowService(AppDbContext db, IJobEnqueuer jobEnqueuer) {
		_db = db;
		_jobEnqueuer = jobEnqueuer;
	}

	public async Task<PublishNowResult> PublishNowAsync(
		PublishNowArgs args,
		CancellationToken cancellationToken
	) {
		var requestedIds = args.SocialAccountIds
			.Distinct()
			.ToList();

		var post = await _db.Post.SingleOrDefaultAsync(
			p => p.Id == args.PostId
				&& p.TenantId == args.TenantId
				&& !p.IsDeleted,
			cancellationToken
		);
		if (post is null) {
			return new PublishNowResult.PostNotFound();
		}

		var candidates = await _db.SocialAccount
			.Where(account => account.TenantId == args.TenantId
				&& account.Id != null
				&& requestedIds.Contains(account.Id.Value))
			.ToListAsync(cancellationToken);
		await AttachProjectLinksAsync(candidates, cancellationToken);

		var knownIds = candidates
			.Select(account => account.GetRequiredId())
			.ToHashSet();
		var unknownIds = requestedIds
			.Where(id => !knownIds.Contains(id))
			.ToList();
		if (unknownIds.Count > 0) {
			return new PublishNowResult.AccountsNotFound(unknownIds);
		}

		// Epic C visibility rule (plan Task 1): a post aimed at a project reaches
		// only accounts visible in THAT project; a projectless post reaches every
		// Active tenant account. Known-but-invisible ids are simply not targets.
		var eligible = candidates
			.Where(account => post.ProjectId is null
				|| VisibleIn.Visible(account, post.ProjectId.Value))
			.ToList();
		var eligibleIds = eligible
			.Select(account => account.GetRequiredId())
			.ToList();

		var liveAccountIds = await LivePairAccountIdsAsync(
			post.GetRequiredId(),
			eligibleIds,
			cancellationToken
		);
		if (liveAccountIds.Count > 0) {
			return new PublishNowResult.LivePublicationsExist(liveAccountIds);
		}

		return await CreatePublicationsAndEnqueueAsync(
			args,
			post.GetRequiredId(),
			eligible,
			cancellationToken
		);
	}

	// The batch write: publications + their delivery jobs commit together or not
	// at all. The row id is minted BEFORE insert so the deterministic key derives
	// from the true id (pattern proven in JobQueueProcessor.cs).
	private async Task<PublishNowResult> CreatePublicationsAndEnqueueAsync(
		PublishNowArgs args,
		Guid postId,
		List<SocialAccount> candidates,
		CancellationToken cancellationToken
	) {
		await using var transaction =
			await _db.Database.BeginTransactionAsync(cancellationToken);
		try {
			var scheduledAtUtc = DateTime.UtcNow;
			var keysByPublicationId = new List<(Guid PublicationId, string Key)>(
				candidates.Count
			);

			foreach (var account in candidates) {
				var publicationId = Guid.CreateVersion7();
				var idempotencyKey = PublicationIdempotencyKey.For(publicationId);
				var publication = new Publication {
					TenantId = args.TenantId,
					PostId = postId,
					SocialAccountId = account.GetRequiredId(),
					ScheduledAtUtc = scheduledAtUtc,
					ScheduledTimeZone = TimeZoneInfo.Local.Id,
					IdempotencyKey = idempotencyKey,
				};
				publication.Id = publicationId;
				_db.Publication.Add(publication);
				keysByPublicationId.Add((publicationId, idempotencyKey));
			}

			await _db.SaveChangesAsync(cancellationToken);

			foreach (var (publicationId, key) in keysByPublicationId) {
				await _jobEnqueuer.EnqueueAsync(
					PublishingJobs.PublishPublicationV1,
					new PublishPublicationPayload {
						PublicationId = publicationId,
						IdempotencyKey = key,
					},
					new EnqueueOptions { IdempotencyKey = key },
					cancellationToken
				);
			}

			await transaction.CommitAsync(cancellationToken);
			return new PublishNowResult.Created(
				keysByPublicationId.Select(entry => entry.PublicationId).ToList()
			);
		} catch (DbUpdateException ex) when (
			ex.InnerException is Npgsql.PostgresException pgEx && pgEx.SqlState == "23505"
		) {
			await transaction.RollbackAsync(cancellationToken);
			// Round-2 NOTE fix (query-then-act race): two concurrent publish-now calls
			// for the same pair can both pass the proactive live check; the partial
			// unique index ux_publications_post_account is the authority. Translate the
			// violation into the SAME plain-words structured outcome the proactive
			// check returns — never a raw 500. The tracker still holds the rolled-back
			// Added rows; clear it so the follow-up audit write cannot re-insert them.
			_db.ChangeTracker.Clear();
			var candidateIds = candidates
				.Select(account => account.GetRequiredId())
				.ToList();
			var occupiedIds = await _db.Publication
				.Where(publication => !publication.IsDeleted)
				.Where(publication => publication.PostId == postId)
				.Where(publication => candidateIds.Contains(publication.SocialAccountId))
				.Select(publication => publication.SocialAccountId)
				.Distinct()
				.ToListAsync(cancellationToken);
			return new PublishNowResult.LivePublicationsExist(occupiedIds);
		} catch {
			await transaction.RollbackAsync(cancellationToken);
			throw;
		}
	}

	// "Live" means NON-TERMINAL only (round-2 MEDIUM fix): Scheduled, InProgress,
	// Paused — named explicitly from PublicationStatus. Terminal Failed rows RELEASE
	// the pair (the partial unique index excludes them too), so re-issuing
	// publish-now after a failure starts a fresh attempt instead of being refused
	// as a duplicate while the failed row stays as history. Published rows KEEP the
	// pair through the index: the remote record already exists and a second
	// delivery would double-post; a caller racing past this check meets the index
	// and gets the same outcome via the constraint translation below.
	private async Task<List<Guid>> LivePairAccountIdsAsync(
		Guid postId,
		IReadOnlyList<Guid> accountIds,
		CancellationToken cancellationToken
	) {
		return await _db.Publication
			.Where(publication => !publication.IsDeleted)
			.Where(publication =>
				publication.Status == PublicationStatus.Scheduled
				|| publication.Status == PublicationStatus.InProgress
				|| publication.Status == PublicationStatus.Paused)
			.Where(publication => publication.PostId == postId)
			.Where(publication => accountIds.Contains(publication.SocialAccountId))
			.Select(publication => publication.SocialAccountId)
			.Distinct()
			.ToListAsync(cancellationToken);
	}

	// SocialAccount.Projects is [NotMapped]: the junction rows are loaded explicitly
	// so the single-source VisibleIn.Visible rule sees real project links.
	private async Task AttachProjectLinksAsync(
		List<SocialAccount> accounts,
		CancellationToken cancellationToken
	) {
		if (accounts.Count == 0) {
			return;
		}

		var accountIds = accounts
			.Select(account => account.GetRequiredId())
			.ToList();
		var links = await _db.SocialAccountProject
			.Where(link => accountIds.Contains(link.SocialAccountId))
			.ToListAsync(cancellationToken);

		foreach (var account in accounts) {
			var accountId = account.GetRequiredId();
			account.Projects = links
				.Where(link => link.SocialAccountId == accountId)
				.ToList();
		}
	}
}
