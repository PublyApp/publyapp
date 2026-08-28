using Microsoft.EntityFrameworkCore;

namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// Parameters for reproducing one dead-lettered job back into job_queue. Carries
/// the preserved envelope fields verbatim (F16): fresh id, zero attempts, the
/// original payload/priority/max_attempts/idempotency/actor context, and the IN
/// lineage copied forward.
/// </summary>
public sealed record DeadLetterRequeueInsert(
	Guid NewJobId,
	string JobType,
	string Payload,
	int Priority,
	int MaxAttempts,
	string? IdempotencyKey,
	Guid? TenantId,
	Guid? ActorUserId,
	string? CorrelationId,
	Guid DeadLetterId
);

/// <summary>
/// F15 enqueue-boundary seam (#636): the dead-letter requeue is the single
/// sanctioned producer that inserts into job_queue OUTSIDE the generic
/// <see cref="IJobEnqueuer"/> definition-policy path — it must reproduce the
/// preserved envelope byte-for-byte inside the CALLER'S open transaction, which
/// the definition-policy enqueuer does not express. Living inside
/// Infrastructure/Jobs keeps the trusted write surface in exactly one folder;
/// the JobEnqueueBoundarySpec allowlist enforces that placement.
/// </summary>
public static class DeadLetterRequeueEnqueuer {
	/// <summary>
	/// Inserts the reproduced queue row and returns the affected row count (0
	/// lets the caller treat the write as lost and fail closed).
	/// </summary>
	public static async Task<int> InsertReproducedRowAsync(
		Data.DbContext.AppDbContext dbContext,
		DeadLetterRequeueInsert insert,
		CancellationToken cancellationToken = default
	) {
		return await dbContext.Database.ExecuteSqlAsync(
			$"""
			INSERT INTO job_queue (
				id, job_type, payload, status, priority, attempts, max_attempts,
				next_attempt_at, idempotency_key, tenant_id, actor_user_id,
				correlation_id, requeued_from_dead_letter_id, created_at, updated_at
			)
			VALUES (
				{insert.NewJobId}, {insert.JobType}, {insert.Payload}::jsonb, 0,
				{insert.Priority}, 0, {insert.MaxAttempts},
				now(), {insert.IdempotencyKey}, {insert.TenantId},
				{insert.ActorUserId}, {insert.CorrelationId},
				{insert.DeadLetterId}, now(), now()
			)
			""",
			cancellationToken
		);
	}
}
