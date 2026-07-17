namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// This worker replica's stable runtime id, generated ONCE per process and injected
/// wherever the id is needed (design §7.1). It is deliberately its OWN singleton
/// rather than a field of the processor or a constructor argument of JobsMetrics.
///
/// §7.1 requires the metrics <c>instance</c> tag to be "the same value used for
/// <c>locked_by</c>" — so a second, independently-generated id is not a cosmetic
/// difference: the §7.2 sampler and the Phase-3 alert route de-duplicate by
/// condition rather than by instance, and correlating "which replica holds this
/// leased row" with "which replica's telemetry is breaching" is the whole point of
/// the tag. Two generators would satisfy every type signature, tag every instrument,
/// and quietly correlate nothing.
///
/// A singleton is what makes one generator structural rather than a convention: the
/// id has exactly one home, and no component can mint its own without deleting this
/// class. It also survives the rest of §7.1 — <c>jobs.listener_*</c> (§5.5),
/// <c>scheduler.*</c>, and <c>email.submit_failures</c> are all instance-tagged and
/// none of them are the processor or JobsMetrics, so an id owned by either would
/// force every later emitter to route through an unrelated collaborator or re-derive
/// the value (i.e. generate a second one).
/// </summary>
public sealed class JobWorkerInstance {
	/// <summary>
	/// Machine name plus a per-process uuid: unique per replica AND per restart, so
	/// leases left behind by a crashed run stay attributable to the run that took
	/// them rather than to its replacement. Nothing about correctness rests on this
	/// value — it identifies, it does not fence (<c>lock_token</c> does, F1) — so it
	/// needs no coordination, persistence, or uniqueness guarantee beyond the uuid.
	/// </summary>
	public string Id { get; } = $"{Environment.MachineName}:{Guid.NewGuid():N}";
}
