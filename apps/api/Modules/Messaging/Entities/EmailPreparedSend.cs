using System.ComponentModel.DataAnnotations.Schema;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.Messaging.Entities;

/// <summary>
/// Send-once scratch that freezes an email's rendered envelope on its FIRST attempt
/// (design §4.5, F7). Resend deduplicates on the idempotency key only for 24 h and only
/// for byte-identical payloads; reloading mutable domain state (renamed tenant, rotated
/// token) each attempt would make a retry carry different content under the same key.
/// Fix: render once, persist the bytes, and resend those bytes on every retry. Keyed by
/// <see cref="JobId"/> (the PK — no surrogate id), inserted once with
/// <c>ON CONFLICT DO NOTHING</c>, hard-deleted in the same transaction as the terminal
/// <c>email_log</c> write. Because the envelope contains a live token the row is
/// deliberately short-lived; the retention sweep deletes orphans older than 7 days.
/// </summary>
[Table("email_prepared_sends")]
public class EmailPreparedSend : INoTenantEntity {
	// The email job this envelope belongs to; also the primary key.
	[Column("job_id")]
	public required Guid JobId { get; set; }

	// Rendered send: recipient, subject, html body (incl. the live token). jsonb.
	[Column("envelope", TypeName = "jsonb")]
	public required string Envelope { get; set; }

	// sha256 of the request bytes — the fingerprint carried into email_log (§4.5).
	[Column("request_sha256")]
	public required string RequestSha256 { get; set; }

	// Stable per job (derived from job_id) — the provider idempotency key for retries.
	[Column("provider_idempotency_key")]
	public required string ProviderIdempotencyKey { get; set; }

	// When PREPARE committed; row existence is itself the commit proof (§4.5, R2-12).
	// Also the retention sweep's age floor — hence ix_email_prepared_sends_prepared_at,
	// since the job_id PK cannot serve a global scan by age (R5-3). DB-generated default
	// (F11): no C# initializer.
	[Column("prepared_at")]
	public DateTime PreparedAt { get; set; }
}
