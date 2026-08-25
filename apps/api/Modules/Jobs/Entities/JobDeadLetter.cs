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
	/// <summary>
	/// Reserved <c>job_type</c> prefix for rows that record a MISSING-state integrity
	/// anomaly (#864/K-2): the future external-state machinery stamps anomaly rows as
	/// e.g. "jobs.missing.email-prepared-state.v1" (§4.5's resolution batch). The
	/// retention sweep exempts untriaged rows carrying this prefix from age deletion,
	/// and the monitor counts held ones for its dlq_untriaged_missing alert — so
	/// nothing outside the anomaly producers may use it.
	/// </summary>
	public const string MissingJobTypePrefix = "jobs.missing.";

	/// <summary>SQL LIKE pattern matching any missing-anomaly job type.</summary>
	public const string MissingJobTypeLikePattern = "jobs.missing.%";

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

	// Requeue lineage (F16/C9, §4.2). IN: the prior DLQ row the job that produced
	// THIS row was requeued from — copied forward by FromJob, so re-dead-lettering a
	// requeued job preserves the chain back to the original failure, which
	// ix_job_dead_letter_requeued_from walks. OUT: the job_queue row a staff requeue
	// produced from this row, and when. Phase 4's RequeueDeadLetterAsync is the sole
	// writer of the OUT pair; both are NULL until it runs.
	[Column("requeued_from_dead_letter_id")]
	public Guid? RequeuedFromDeadLetterId { get; set; }

	[Column("requeued_as_job_id")]
	public Guid? RequeuedAsJobId { get; set; }

	[Column("requeued_at")]
	public DateTime? RequeuedAt { get; set; }

	// Explicit operator acknowledgement that someone LOOKED at this row (#864/K-2).
	// All three stay NULL until a staff surface stamps them (#636, Phase 4 — there is
	// deliberately no writer before that surface exists). "Triaged" means
	// TriagedAt IS NOT NULL: an untriaged missing-anomaly row is NEVER eligible for
	// retention deletion, no matter how old, so an integrity anomaly cannot age out
	// of existence and silently clear its own alert. TriagedBy is free text for now:
	// no actor can honestly fill a users FK before #636 defines the acting identity.
	[Column("triaged_at")]
	public DateTime? TriagedAt { get; set; }

	[Column("triaged_by")]
	public string? TriagedBy { get; set; }

	[Column("triage_note")]
	public string? TriageNote { get; set; }

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
			LockedBy = job.LockedBy,
			// Carry the chain forward (§4.2, C9): if this job was itself a requeue of
			// an earlier DLQ row, the new terminal record must still point back at it
			// — otherwise the lineage ends at whichever failure happened to be last.
			RequeuedFromDeadLetterId = job.RequeuedFromDeadLetterId
		};
	}
}
