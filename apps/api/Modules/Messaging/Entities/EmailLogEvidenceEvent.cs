using System.ComponentModel.DataAnnotations.Schema;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.Messaging.Entities;

/// <summary>
/// Append-only evidence trail for an <see cref="EmailLog"/> row's §4.4 provider-evidence
/// transitions (issue #866, jobs design §4.4/K-6 — the R10-3/O30 shape applied to
/// email_log). One row per applied transition, written by
/// <c>IEmailLogWriter.ApplyProviderEvidenceAsync</c> in the same transaction as the
/// conditioned update it justifies.
///
/// The author is NAMED but has no user: a provider webhook or reconciliation import is
/// actor-less, and audit_logs cannot carry the entry (user_id NOT NULL FK to users) —
/// that unbuildable audit write is exactly the #866 defect. Instead every row records
/// <see cref="ActorKind"/> + <see cref="ActorId"/> (controlled vocabulary + provider
/// correlation text), never null and never a fabricated users.id. The staff dashboard
/// rebuilds transition history from this table.
///
/// Never updated or deleted by anyone; rows die only with their subject via the FK
/// CASCADE when the retention sweep removes the email_log row (§7.3). No tenant scope,
/// so it does NOT inherit <see cref="BaseAttributes"/> and uses database-generated
/// timestamps (F11) with no C# initializers.
/// </summary>
[Table("email_log_evidence_events")]
public class EmailLogEvidenceEvent : INoTenantEntity {
	[Column("id")]
	public Guid? Id { get; set; }

	// Parent email_log row. ON DELETE CASCADE: evidence dies with its subject.
	// Nullable CLR-side only because the BaseAttributes PK is Guid?; the relationship
	// is configured .IsRequired() so the COLUMN stays NOT NULL (spec-pinned).
	[Column("email_log_id")]
	public Guid? EmailLogId { get; set; }

	// Vocabulary value from EmailLogEvents.
	[Column("event")]
	public required string Event { get; set; }

	// Who produced the transition: a value from EmailLogActorKinds ('provider_webhook'
	// today). NOT NULL text on purpose (#866): an actor-less transition still names its
	// author — never null, never a fabricated users.id.
	[Column("actor_kind")]
	public required string ActorKind { get; set; }

	// Correlation of the named author: the provider event id / import batch id.
	[Column("actor_id")]
	public required string ActorId { get; set; }

	[Column("prior_outcome")]
	public int PriorOutcome { get; set; }

	[Column("new_outcome")]
	public int NewOutcome { get; set; }

	// Bounded, sanitized context (F20): e.g. reason code; never tokens, payload JSON,
	// or full provider bodies.
	[Column("details", TypeName = "jsonb")]
	public string Details { get; set; } = "{}";

	[Column("occurred_at")]
	public DateTime OccurredAt { get; set; }

	// Read-side navigation for per-subject history queries; never written directly.
	public EmailLog? EmailLog { get; set; }

	// Correlation duplicated onto the EVIDENCE row itself (#866 round-1 finding 3):
	// ux_email_log_evidence_events_provider_event_id rejects a replayed provider event
	// even for a writer that never re-stamps the parent row. NULL for non-provider
	// events (mirrors email_log.provider_event_id).
	[Column("provider_event_id")]
	public string? ProviderEventId { get; set; }
}
