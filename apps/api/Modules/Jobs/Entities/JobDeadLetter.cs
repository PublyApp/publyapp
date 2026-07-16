using System.ComponentModel.DataAnnotations.Schema;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.Jobs.Entities;

/// <summary>
/// Append-only terminal record of a job that exhausted its attempts or failed
/// permanently. The engine copies the FULL envelope + lineage here (F16) — so a
/// server-side requeue can reproduce the original job faithfully — and hard-deletes
/// the queue row in the same fencing-conditioned transaction (design §4.2/§6). Never
/// soft-deleted, so it does NOT inherit <see cref="BaseAttributes"/>; timestamps are
/// database-generated (F11) except <see cref="EnqueuedAt"/>, which is copied data.
/// </summary>
[Table("job_dead_letter")]
public class JobDeadLetter : INoTenantEntity {
	[Column("id")]
	public Guid? Id { get; set; }

	// Lineage: the job_queue.id this row came from.
	[Column("original_job_id")]
	public required Guid OriginalJobId { get; set; }

	// Versioned type, exactly as enqueued (F14) — a requeue of a no-longer-registered
	// version fails with a clear error instead of enqueueing an undispatchable job.
	[Column("job_type")]
	public required string JobType { get; set; }

	[Column("payload", TypeName = "jsonb")]
	public required string Payload { get; set; }

	// Envelope preserved for faithful requeue (F16).
	[Column("priority")]
	public int Priority { get; set; }

	[Column("max_attempts")]
	public int MaxAttempts { get; set; }

	[Column("idempotency_key")]
	public string? IdempotencyKey { get; set; }

	// Provenance (F15).
	[Column("tenant_id")]
	public Guid? TenantId { get; set; }

	[Column("actor_user_id")]
	public Guid? ActorUserId { get; set; }

	[Column("correlation_id")]
	public string? CorrelationId { get; set; }

	// The original job_queue.created_at — copied data, not a now() stamp.
	[Column("enqueued_at")]
	public DateTime EnqueuedAt { get; set; }

	[Column("attempts")]
	public int Attempts { get; set; }

	// Bounded + sanitized (F20).
	[Column("last_error")]
	public string? LastError { get; set; }

	// Which worker exhausted it.
	[Column("locked_by")]
	public string? LockedBy { get; set; }

	// DB-generated defaults (F11): no C# initializers.
	[Column("failed_at")]
	public DateTime FailedAt { get; set; }

	[Column("created_at")]
	public DateTime CreatedAt { get; set; }

	public static JobDeadLetter FromJob(JobQueueItem job, int attempts, string? lastError) {
		if (job.Id is null) {
			throw new InvalidOperationException(
				"Cannot dead-letter a JobQueueItem that has not been persisted (Id is null)."
			);
		}

		return new JobDeadLetter {
			OriginalJobId = job.Id.Value,
			JobType = job.JobType,
			Payload = job.Payload,
			Priority = job.Priority,
			MaxAttempts = job.MaxAttempts,
			IdempotencyKey = job.IdempotencyKey,
			TenantId = job.TenantId,
			ActorUserId = job.ActorUserId,
			CorrelationId = job.CorrelationId,
			EnqueuedAt = job.CreatedAt,
			Attempts = attempts,
			LastError = lastError,
			LockedBy = job.LockedBy
		};
	}
}
