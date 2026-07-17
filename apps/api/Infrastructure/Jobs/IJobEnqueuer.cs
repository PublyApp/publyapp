namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// Options for one enqueue call. The idempotency key provides IN-FLIGHT dedup only,
/// scoped per job_type by the partial unique index (design §4.1, F13): success
/// deletes the row and the key with it. Permanent "never run this logical work
/// twice" dedup is owned by a domain outcome marker, not this key.
/// </summary>
public sealed record EnqueueOptions {
	public string? IdempotencyKey { get; init; }
}

/// <summary>
/// The ONLY write path into job_queue (design §5.1, F15; spec-guarded). Scoped: it
/// injects the caller's scoped AppDbContext, so the insert joins the caller's open
/// transaction — a rolled-back domain write takes its job with it. Stamps provenance
/// (tenant, actor, correlation) and emits the transactional NOTIFY wake (§5.5).
/// </summary>
public interface IJobEnqueuer {
	/// <summary>
	/// Validates, serializes (canonical <see cref="JobJson"/> wire form), persists,
	/// and returns the new job id. Duplicate (job_type, idempotency_key) surfaces as
	/// the database unique violation to the caller.
	/// </summary>
	Task<Guid> EnqueueAsync<TPayload>(
		JobDefinition<TPayload> definition,
		TPayload payload,
		EnqueueOptions? options = null,
		CancellationToken cancellationToken = default
	);
}
