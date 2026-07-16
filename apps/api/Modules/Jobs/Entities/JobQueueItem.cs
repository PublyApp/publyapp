using System.ComponentModel.DataAnnotations.Schema;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.Jobs.Entities;

public enum JobQueueStatus {
	// Waiting to be claimed. next_attempt_at gates first-run AND retry (backoff
	// lives here, never in a separate status), so one claim predicate covers both.
	Pending = 0,
	// Claimed by a worker for execution under a locked_until lease + lock_token
	// fencing token. A row leased past locked_until is reset to Pending by the
	// stale-lease sweep and reclaimed with a NEW token; the old owner is fenced out.
	Processing = 1
}

/// <summary>
/// A durable, generic background job. Deliberately NOT a <see cref="BaseAttributes"/>
/// entity: success is a HARD delete and terminal failure copies the row to
/// job_dead_letter then hard-deletes it, so the soft-delete conversion in
/// AppDbContext.UpdateAuditFields would actively fight the design. Only
/// Pending/Processing are ever persisted — there is no Succeeded/Failed status
/// (design §4.0/§4.1). Every engine transition (claim, renewal, requeue, complete,
/// dead-letter) runs as raw SQL conditioned on <see cref="LockToken"/>, evaluated
/// against database now() — bypassing audit overrides and app clocks entirely (F1,
/// F11). All safety-relevant timestamps are database-generated: no C# initializers.
/// </summary>
[Table("job_queue")]
public class JobQueueItem : INoTenantEntity {
	[Column("id")]
	public Guid? Id { get; set; }

	// Versioned handler dispatch key (e.g. "email.tenant-invitation.v1" — F14),
	// mapping to exactly one IJobHandler via JobHandlerRegistry.
	[Column("job_type")]
	public required string JobType { get; set; }

	[Column("payload", TypeName = "jsonb")]
	public string Payload { get; set; } = "{}";

	[Column("status")]
	public JobQueueStatus Status { get; set; } = JobQueueStatus.Pending;

	// 0–1000 (DB CHECK); higher is claimed sooner (ORDER BY priority DESC).
	[Column("priority")]
	public int Priority { get; set; }

	// Count of prior FAILED attempts (0 on first run); abandoned runs don't count.
	[Column("attempts")]
	public int Attempts { get; set; }

	// 1–50 (DB CHECK), per-definition override so a cheap idempotent sweep and an
	// expensive export can differ in how many times they retry before the DLQ.
	[Column("max_attempts")]
	public int MaxAttempts { get; set; } = 10;

	// Scheduling + backoff both live here: a Pending row is only due once
	// next_attempt_at <= now(). SQL-computed only (DB default / interval arithmetic
	// in the engine's statements) — never an app-written timestamp (F11).
	[Column("next_attempt_at")]
	public DateTime NextAttemptAt { get; set; }

	// Explicit lease; NULL when unclaimed. Stamped/renewed in SQL from now() (F11).
	[Column("locked_until")]
	public DateTime? LockedUntil { get; set; }

	// Claiming worker/replica id, for observability.
	[Column("locked_by")]
	public string? LockedBy { get; set; }

	// Fencing token (F1): a fresh uuid per claim. Every subsequent transition is
	// conditioned on it; zero affected rows = the lease was lost to a new claimant.
	[Column("lock_token")]
	public Guid? LockToken { get; set; }

	// Bounded + sanitized (F20): exception type + message, ≤ 2 KB, never payload or
	// token echo.
	[Column("last_error")]
	public string? LastError { get; set; }

	// Optional IN-FLIGHT dedup, scoped per job_type by the partial unique index
	// (F13). Success deletes the key with the row; permanent dedup belongs to a
	// domain outcome marker.
	[Column("idempotency_key")]
	public string? IdempotencyKey { get; set; }

	// Provenance envelope (F15). Null for system-originated jobs.
	[Column("tenant_id")]
	public Guid? TenantId { get; set; }

	[Column("actor_user_id")]
	public Guid? ActorUserId { get; set; }

	[Column("correlation_id")]
	public string? CorrelationId { get; set; }

	// DB-generated (defaults + SQL SET in every engine transition) — F11.
	[Column("created_at")]
	public DateTime CreatedAt { get; set; }

	[Column("updated_at")]
	public DateTime UpdatedAt { get; set; }
}
