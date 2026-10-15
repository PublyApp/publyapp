using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.Publishing.Entities;

/// <summary>
/// Where one write attempt stands (#2176). A row is committed as NotSent BEFORE
/// the provider call; a row that never leaves NotSent or Unknown means the call
/// may have been applied, so the next attempt reconciles before writing again.
/// </summary>
public enum SubmissionState {
	/// <summary>Committed before the call; no outcome recorded yet (also: the worker died).</summary>
	NotSent = 1,
	/// <summary>The provider returned the record id; it is stored on the row.</summary>
	Accepted = 2,
	/// <summary>Definitive refusal, or provably not applied (e.g. 429): nothing was created.</summary>
	Rejected = 3,
	/// <summary>Timeout, connection reset, 5xx or unreadable answer: may have been applied.</summary>
	Unknown = 4,
	/// <summary>Reconciled as absent (or the user chose to retry): a later attempt took over.</summary>
	Superseded = 5,
}

/// <summary>
/// The write-attempt journal (#2176): one row per externally visible write (one
/// thread segment), written by <c>PublishAttemptJournal</c>. The fingerprint is a
/// hash of the effective text and media ids — the post text itself is never stored.
/// </summary>
[Table("publication_publish_attempts")]
public class PublishAttempt : BaseAttributes, ITenantEntity {
	private PublyApp.Api.Modules.Tenants.Entities.Tenant? _Tenant;

	[Column("tenant_id")]
	public required Guid TenantId { get; set; }
	[JsonIgnore]
	public PublyApp.Api.Modules.Tenants.Entities.Tenant Tenant {
		get { return RequiredNavigation.Get(this._Tenant, nameof(PublishAttempt), nameof(this.Tenant)); }
		set { this._Tenant = value; }
	}

	[Column("publication_id")]
	public required Guid PublicationId { get; set; }

	/// <summary>0-based thread position (0 = the root post).</summary>
	[Column("segment_position")]
	public required int SegmentPosition { get; set; }

	/// <summary>The publication's attempt counter when the write started.</summary>
	[Column("attempt_number")]
	public required int AttemptNumber { get; set; }

	/// <summary>What is written: <c>create_post</c> or <c>create_reply</c>.</summary>
	[Column("operation")]
	public required string Operation { get; set; }

	/// <summary>SHA-256 (hex) of the effective text and media ids; never the text.</summary>
	[Column("content_fingerprint")]
	public required string ContentFingerprint { get; set; }

	/// <summary>The provider-side dedupe key of this write.</summary>
	[Column("idempotency_key")]
	public required string IdempotencyKey { get; set; }

	[Column("submission_state")]
	public SubmissionState SubmissionState { get; set; } = SubmissionState.NotSent;

	[Column("external_record_id")]
	public string? ExternalRecordId { get; set; }

	[Column("external_url")]
	public string? ExternalUrl { get; set; }
}
