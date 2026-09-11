using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Lib;
using PublyApp.Api.Modules.Publishing.Services;

namespace PublyApp.Api.Modules.Publishing.Jobs;

/// <summary>
/// The every-minute due scan for scheduled publications (Epic D3): claims every
/// due Scheduled publication and enqueues exactly one keyed
/// publishing.publish-publication.v1 job per claimed row. Claiming uses raw SQL
/// <c>FOR UPDATE SKIP LOCKED</c> so two concurrent scans never claim the same
/// row; the enqueue carries <see cref="PublicationIdempotencyKey.For"/> so the
/// partial unique index on job_queue makes in-flight duplicates impossible even
/// if two workers interleave between the claim and the insert.
/// </summary>
public sealed class DispatchDuePostsJob : IJobHandler {
	public const string JobKey = "publishing.dispatch-due-posts.v1";

	private readonly AppDbContext _DbContext;
	private readonly IJobEnqueuer _JobEnqueuer;
	private readonly IPublicationStatusTransitionService _Transitions;

	public DispatchDuePostsJob(
		AppDbContext dbContext,
		IJobEnqueuer jobEnqueuer,
		IPublicationStatusTransitionService transitions
	) {
		_DbContext = dbContext;
		_JobEnqueuer = jobEnqueuer;
		_Transitions = transitions;
	}

	public string JobType {
		get { return JobKey; }
	}

	public async Task<JobOutcome> HandleAsync(
		JobContext context,
		CancellationToken cancellationToken
	) {
		var scheduledStatus = (int)PublicationStatus.Scheduled;

		// One transaction spans the whole claim -> keyed-enqueue -> InProgress
		// sequence: the FOR UPDATE row locks live exactly as long as the dedup
		// inserts, so a competing scan either SKIPS the still-locked row or
		// finds it already InProgress — never both enqueued.
		await using var transaction =
			await _DbContext.Database.BeginTransactionAsync(cancellationToken);

		var claimedIds = await _DbContext.Database
			.SqlQuery<Guid>($"""
				SELECT id AS "Value" FROM publications
				WHERE status = {scheduledStatus} AND is_deleted = false
					AND scheduled_at_utc <= now()
				ORDER BY scheduled_at_utc, id
				LIMIT {_DueScanBatchSize}
				FOR UPDATE SKIP LOCKED
				""")
			.ToListAsync(cancellationToken);

		foreach (var publicationId in claimedIds) {
			cancellationToken.ThrowIfCancellationRequested();

			var key = PublicationIdempotencyKey.For(publicationId);
			_ = await _JobEnqueuer.EnqueueAsync(
				PublishingJobs.PublishPublicationV1,
				new PublishPublicationPayload {
					PublicationId = publicationId,
					IdempotencyKey = key,
				},
				new EnqueueOptions { IdempotencyKey = key },
				cancellationToken
			);

			_ = await _Transitions.MarkInProgressAsync(
				new MarkPublicationInProgressArgs(
					publicationId,
					await _TenantOfAsync(publicationId, cancellationToken)
				),
				cancellationToken
			);
		}

		await transaction.CommitAsync(cancellationToken);
		return JobOutcome.Succeeded;
	}

	private const int _DueScanBatchSize = 200;

	private async Task<Guid> _TenantOfAsync(
		Guid publicationId,
		CancellationToken cancellationToken
	) {
		var tenantId = await (
			from p in _DbContext.Publication.AsNoTracking()
			where p.Id == publicationId
			select p.TenantId
		).FirstOrDefaultAsync(cancellationToken);
		if (tenantId == Guid.Empty) {
			throw new InvalidOperationException(
				$"Claimed publication '{publicationId}' vanished before "
					+ "MarkInProgress — the transaction must roll back."
			);
		}

		return tenantId;
	}
}
