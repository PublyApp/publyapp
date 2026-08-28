namespace PublyApp.Api.Modules.Jobs.Entities;

/// <summary>
/// Wire vocabulary for <see cref="JobDeadLetterEvent.Event"/> values. Centralized so
/// producers and specs never spell the strings inline (no magic strings). Values pair
/// 1:1 with the <see cref="ExternalStateStatus"/> they stamp (design §5.1, event
/// vocabulary table).
/// </summary>
public static class JobDeadLetterEvents {
	/// <summary>An operator confirmed the externally-referenced resource is absent; stamps status 4 Missing.</summary>
	public const string MissingConfirmed = "dead_letter.external_state.missing";

	/// <summary>A row was flagged as needing human triage; stamps status 6 Unclassified (future writer).</summary>
	public const string UnclassifiedFlagged = "dead_letter.external_state.unclassified";

	/// <summary>
	/// A row was requeued back into job_queue by a staff operator (A5, #636).
	/// Not in the design's 1:1 event-vocabulary table on purpose: a requeue is
	/// not a status transition — the DLQ row's external_state_status does not
	/// change, only its requeued_as_job_id/requeued_at lineage pair does.
	/// </summary>
	public const string Requeued = "dead_letter.requeued";
}
