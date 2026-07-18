using System.ComponentModel.DataAnnotations.Schema;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.Messaging.Entities;

/// <summary>
/// Delivery record for a transactional email (design §4.4, D2 — day one). Written by the
/// email job handlers (and the engine's terminal-failure hook, §5.4) on TERMINAL local
/// outcomes, and deleted only by the Phase-3 retention sweep. The queue stays
/// delete-on-success; email history lives here.
///
/// The row is append-only on the LOCAL send path but is not row-immutable (§4.4): later
/// provider evidence may transition it along a narrow allowlist
/// (<see cref="EmailLogOutcome.LegacySubmissionUnverified"/> → Submitted with acceptance
/// evidence; Submitted → delivered/bounced/complained for authenticated webhooks) via the
/// single conditioned update path, which stamps <see cref="EvidenceSource"/>,
/// <see cref="ProviderEventId"/> and <see cref="UpdatedAt"/> and audits every transition.
/// That writer and the webhook outcomes belong to the later webhook packet; this branch
/// only carries the lifecycle columns.
///
/// Not soft-deleted, so it does NOT inherit <see cref="BaseAttributes"/>; timestamps are
/// database-generated (F11). No FK constraints on <see cref="InvitationId"/>/
/// <see cref="UserId"/> — an audit trail must outlive the rows it references
/// (indexes/constraints in the migration).
/// </summary>
[Table("email_log")]
public class EmailLog : INoTenantEntity {
	[Column("id")]
	public Guid? Id { get; set; }

	// The job_queue.id that produced this outcome; NULL for rows back-copied from the
	// historical outbox during the fold. Unique (partial) so a reclaimed job whose
	// Submitted row already exists never resends (§5.4 idempotency marker).
	[Column("job_id")]
	public Guid? JobId { get; set; }

	// Fold lineage: the source invitation_email_outbox.id (§4.6). Set only on
	// back-copied rows; also makes the back-copy idempotent across migration steps.
	[Column("legacy_outbox_id")]
	public Guid? LegacyOutboxId { get; set; }

	[Column("kind")]
	public required EmailKind Kind { get; set; }

	[Column("recipient")]
	public required string Recipient { get; set; }

	[Column("outcome")]
	public required EmailLogOutcome Outcome { get; set; }

	// Related entity ids (no FK constraints — see class remarks).
	[Column("invitation_id")]
	public Guid? InvitationId { get; set; }

	[Column("user_id")]
	public Guid? UserId { get; set; }

	// Provider correlation (F3/F20) — the accepted-send message id.
	[Column("provider_message_id")]
	public string? ProviderMessageId { get; set; }

	// sha256 of the exact provider request bytes sent (F7/R2-2) — a fingerprint only; the
	// token itself never lands here, it lives only in the short-lived scratch (§4.5).
	[Column("request_sha256")]
	public string? RequestSha256 { get; set; }

	[Column("attempts")]
	public int Attempts { get; set; }

	// Bounded + sanitized (F20): never tokens, payload JSON, or full provider bodies.
	[Column("last_error")]
	public string? LastError { get; set; }

	// Provenance of the CURRENT Outcome (§4.4). Locally-observed outcomes — everything
	// this branch writes, including the fold's back-copied rows — are EmailEvidenceSource
	// .Local; the provider-evidence values arrive with the webhook packet.
	[Column("evidence_source")]
	public string EvidenceSource { get; set; } = EmailEvidenceSource.Local;

	// The provider event id that justified the current transition; dedups webhook /
	// reconciliation replays via ux_email_log_provider_event_id (§4.4). NULL for locally
	// observed outcomes.
	[Column("provider_event_id")]
	public string? ProviderEventId { get; set; }

	// DB-generated defaults (F11): no C# initializers.
	[Column("occurred_at")]
	public DateTime OccurredAt { get; set; }

	[Column("created_at")]
	public DateTime CreatedAt { get; set; }

	// Set to now() by the evidence-transition update (§4.4); equals created_at until then.
	[Column("updated_at")]
	public DateTime UpdatedAt { get; set; }
}
