using System.ComponentModel.DataAnnotations.Schema;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.Jobs.Entities;

/// <summary>
/// Append-only evidence trail for a <see cref="JobDeadLetter"/> row's external-state
/// triage (jobs-infra design §5.1; K-1 / issue #863). One row per classification
/// transition. Never updated or deleted (hard-delete only via the dead-letter FK
/// cascade when the parent is swept); no tenant scope, so it does NOT inherit
/// <see cref="BaseAttributes"/> and uses database-generated timestamps (F11) with
/// no C# initializers.
/// </summary>
[Table("job_dead_letter_events")]
public class JobDeadLetterEvent : INoTenantEntity {
	[Column("id")]
	public Guid? Id { get; set; }

	// Parent dead-letter row. ON DELETE CASCADE: evidence dies with its subject.
	[Column("dead_letter_id")]
	public required Guid DeadLetterId { get; set; }

	// Vocabulary value from JobDeadLetterEvents.
	[Column("event")]
	public required string Event { get; set; }

	// Who produced the classification ('operator' today).
	[Column("detected_by")]
	public required string DetectedBy { get; set; }

	[Column("prior_status")]
	public int PriorStatus { get; set; }

	[Column("new_status")]
	public int NewStatus { get; set; }

	// Bounded, sanitized context (F20): e.g. originalJobId, jobType, reason, note.
	[Column("details", TypeName = "jsonb")]
	public string Details { get; set; } = "{}";

	[Column("occurred_at")]
	public DateTime OccurredAt { get; set; }
}
