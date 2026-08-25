namespace PublyApp.Api.Modules.Jobs.Entities;

/// <summary>
/// Coarse triage state of a dead-lettered job's external side effects (jobs-infra
/// design §5.1 terminal-path step 5; Known-open item K-1 / issue #863). Stored on
/// <c>job_dead_letter.external_state_status</c>; 0 (<see cref="None"/>) is the
/// backfill/absence default and means "nothing is known", which stays eligible for
/// plain age retention. The engine never stamps statuses today — classifications
/// arrive only through the evidence-table writers (operator triage now, sweep
/// batches later). Member set is pinned by the DeadLetterResolutionCatalog spec:
/// adding an eighth member without extending the catalog fails the build.
/// </summary>
public enum ExternalStateStatus {
	/// <summary>No classification exists yet (backfill default); age retention applies.</summary>
	None = 0,

	/// <summary>Prepared external effects are believed to still exist; future sweep-batch input.</summary>
	Present = 1,

	/// <summary>A sweep confirmed the prepared effects no longer exist; age retention applies.</summary>
	Expired = 2,

	/// <summary>This job type never prepares external effects; permanently retention-eligible.</summary>
	NeverPrepared = 3,

	/// <summary>An operator confirmed the referenced resource is absent; retention-eligible.</summary>
	Missing = 4,

	/// <summary>Side effects were handed off outside this database; retention-eligible.</summary>
	Transferred = 5,

	/// <summary>
	/// Needs human triage: EXEMPT from age retention until resolved through
	/// POST /staff/dead-letter/{id}/resolve-unclassified (issue #863).
	/// </summary>
	Unclassified = 6,
}
