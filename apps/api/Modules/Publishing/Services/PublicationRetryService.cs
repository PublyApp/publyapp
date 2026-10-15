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
	public sealed record Eligible(string IdempotencyKey) : RetryEligibility;

	public sealed record NotFound : RetryEligibility;

	/// <summary>Only Failed and Paused publications can be retried.</summary>
	public sealed record NotRetryable(PublicationStatus Status) : RetryEligibility;

	/// <summary>A Paused publication whose account still needs reconnecting.</summary>
	public sealed record ReconnectFirst : RetryEligibility;
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

		if (publication.Status == PublicationStatus.Paused
			&& await this._Db.SocialAccount.AsNoTracking().AnyAsync(
				account => account.Id == publication.SocialAccountId
					&& account.Status == SocialAccountStatus.NeedsReconnect,
				cancellationToken
			)) {
			return new RetryEligibility.ReconnectFirst();
		}

		return new RetryEligibility.Eligible(publication.IdempotencyKey);
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
