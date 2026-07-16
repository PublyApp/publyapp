using System.ComponentModel.DataAnnotations.Schema;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.Jobs.Entities;

public enum JobQueueStatus {
	// Waiting to be claimed. next_attempt_at gates first-run AND retry (backoff
	// lives here, never in a separate status), so one claim predicate covers both.
	Pending = 0,
	// Claimed by a worker for execution. A row leased past locked_until without
	// being deleted (success) or dead-lettered (terminal) is treated as abandoned
	// (crashed worker) and becomes claimable again.
	Processing = 1
}

/// <summary>
/// A durable, generic background job. Deliberately NOT a <see cref="BaseAttributes"/>
/// entity: success is a HARD delete and terminal failure copies the row to
/// job_dead_letter then hard-deletes it, so the soft-delete conversion in
/// AppDbContext.UpdateAuditFields would actively fight the design. Only
/// Pending/Processing are ever persisted — there is no Succeeded/Failed status
/// (design §4.0/§4.1). Claim/complete run through raw SQL against database now(),
/// bypassing audit overrides entirely.
/// </summary>
[Table("job_queue")]
public class JobQueueItem : INoTenantEntity {
	[Column("id")]
	public Guid? Id { get; set; }

	// Handler dispatch key: maps to exactly one IJobHandler via JobHandlerRegistry.
	[Column("job_type")]
	public required string JobType { get; set; }

	[Column("payload", TypeName = "jsonb")]
	public string Payload { get; set; } = "{}";

	[Column("status")]
	public JobQueueStatus Status { get; set; } = JobQueueStatus.Pending;

	// Higher is claimed sooner (ORDER BY priority DESC).
	[Column("priority")]
	public int Priority { get; set; }

	[Column("attempts")]
	public int Attempts { get; set; }

	// Per-enqueue override allowed so a cheap idempotent sweep and an expensive
	// export can differ in how many times they retry before dead-lettering.
	[Column("max_attempts")]
	public int MaxAttempts { get; set; } = 8;

	// Scheduling + backoff both live here: a Pending row is only due once
	// next_attempt_at <= now().
	[Column("next_attempt_at")]
	public DateTime NextAttemptAt { get; set; } = DateTime.UtcNow;

	// Explicit lease (unlike the email outbox, which derives its lease from
	// claimed_at + a constant); NULL when unclaimed.
	[Column("locked_until")]
	public DateTime? LockedUntil { get; set; }

	// Claiming worker/replica id, for observability.
	[Column("locked_by")]
	public string? LockedBy { get; set; }

	[Column("last_error")]
	public string? LastError { get; set; }

	// Optional dedup on enqueue (e.g. due-post dispatch enqueues a post at most
	// once) via the ux_job_queue_idempotency partial unique index.
	[Column("idempotency_key")]
	public string? IdempotencyKey { get; set; }

	[Column("created_at")]
	public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

	[Column("updated_at")]
	public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

	public static JobQueueItem Create(
		string jobType,
		string payload = "{}",
		int priority = 0,
		int maxAttempts = 8,
		string? idempotencyKey = null
	) {
		return new JobQueueItem {
			JobType = jobType,
			Payload = payload,
			Priority = priority,
			MaxAttempts = maxAttempts,
			IdempotencyKey = idempotencyKey
		};
	}
}
