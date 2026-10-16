using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Jobs;
using PublyApp.Api.Modules.SocialAccounts.Entities;

namespace PublyApp.Api.Modules.Publishing.Services;

/// <summary>
/// Read-only eligibility verdict for one retry request (#647). The handler maps
/// each refusal onto a typed 404/409, then applies the Scheduled move through
/// <see cref="IPublicationStatusTransitionService.RetryAsync"/> (the single legal
/// status writer) and finally enqueues the delivery job.
/// </summary>
public abstract record RetryEligibility {
	/// <summary>Carries the row's idempotency key for the dedup-keyed enqueue.</summary>
	public sealed record Eligible(string IdempotencyKey, bool WasNeedsReview = false)
		: RetryEligibility;

	public sealed record NotFound : RetryEligibility;

	/// <summary>Only Failed and Paused publications can be retried.</summary>
	public sealed record NotRetryable(PublicationStatus Status) : RetryEligibility;

	/// <summary>The account is not Active (needs reconnect, revoked or gone).</summary>
	public sealed record ReconnectFirst : RetryEligibility;

	/// <summary>
	/// A newer publication exists for the same post and account (any status): only
	/// the newest row per pair is retryable, or a thread's segments could post twice.
	/// </summary>
	public sealed record Superseded : RetryEligibility;
}

/// <summary>
/// Retry support (#647): eligibility check plus the keyed enqueue. Infrastructure
/// dependencies only; status is never written here. The enqueue reuses the
/// publication's existing idempotency key, so a provider that already accepted the
/// first attempt cannot produce a duplicate, and the in-flight dedup index keeps a
/// double click or a racing due-scan to a single job.
/// </summary>
public interface IPublicationRetryService {
	Task<RetryEligibility> CheckAsync(
		Guid tenantId,
		Guid publicationId,
		CancellationToken cancellationToken
	);

	Task EnqueueAsync(
		Guid publicationId,
		string idempotencyKey,
		CancellationToken cancellationToken
	);
}

[Service(ServiceLifetime.Scoped)]
public sealed class PublicationRetryService : IPublicationRetryService {
	private readonly AppDbContext _Db;
	private readonly IJobEnqueuer _JobEnqueuer;

	public PublicationRetryService(AppDbContext db, IJobEnqueuer jobEnqueuer) {
		this._Db = db;
		this._JobEnqueuer = jobEnqueuer;
	}

	public async Task<RetryEligibility> CheckAsync(
		Guid tenantId,
		Guid publicationId,
		CancellationToken cancellationToken
	) {
		var publication = await this._Db.Publication
			.AsNoTracking()
			.SingleOrDefaultAsync(
				candidate => candidate.Id == publicationId
					&& candidate.TenantId == tenantId
					&& !candidate.IsDeleted,
				cancellationToken
			);
		if (publication is null) {
			return new RetryEligibility.NotFound();
		}

		if (publication.Status is not (PublicationStatus.Failed or PublicationStatus.Paused)) {
			return new RetryEligibility.NotRetryable(publication.Status);
		}

		var accountIsActive = await this._Db.SocialAccount.AsNoTracking().AnyAsync(
			account => account.Id == publication.SocialAccountId
				&& !account.IsDeleted
				&& account.Status == SocialAccountStatus.Active,
			cancellationToken
		);
		if (!accountIsActive) {
			return new RetryEligibility.ReconnectFirst();
		}

		var superseded = await this._Db.Publication.AsNoTracking().AnyAsync(
			// Soft-deleted rows count too: a cancelled publication that already
			// published thread segments is soft-deleted (#2171/#2180), and retrying
			// an older row would repost exactly those segments.
			other => other.TenantId == publication.TenantId
				&& other.PostId == publication.PostId
				&& other.SocialAccountId == publication.SocialAccountId
				&& other.Id != publication.Id
				&& other.CreatedAt > publication.CreatedAt,
			cancellationToken
		);
		if (superseded) {
			return new RetryEligibility.Superseded();
		}

		return new RetryEligibility.Eligible(
			publication.IdempotencyKey,
			publication.FailureCategory == PublicationFailureCategory.NeedsReview
		);
	}

	public async Task EnqueueAsync(
		Guid publicationId,
		string idempotencyKey,
		CancellationToken cancellationToken
	) {
		try {
			_ = await this._JobEnqueuer.EnqueueAsync(
				PublishingJobs.PublishPublicationV1,
				new PublishPublicationPayload {
					PublicationId = publicationId,
					IdempotencyKey = idempotencyKey,
				},
				new EnqueueOptions { IdempotencyKey = idempotencyKey },
				cancellationToken
			);
		} catch (DbUpdateException ex) when (
			ex.InnerException is Npgsql.PostgresException {
				SqlState: "23505",
				ConstraintName: "ux_job_queue_type_idempotency",
			}
		) {
			// The due-scan (or an earlier click) already enqueued this key: one job
			// is in flight, which is exactly the goal.
			this._Db.ChangeTracker.Clear();
		}
	}
}
