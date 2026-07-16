namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// Typed result of a job execution (design §5.1, F12). Handlers return one of these;
/// the engine additionally classifies thrown exceptions into the same taxonomy
/// (JsonException/unknown type → PermanentFailure, non-host cancellation and unknown
/// exceptions → Retry). Nothing is implicitly retried forever, and only the host's own
/// token means shutdown.
/// </summary>
public abstract record JobOutcome {
	private JobOutcome() {
	}

	/// <summary>The job did its work. The engine hard-deletes the queue row.</summary>
	public sealed record Success : JobOutcome;

	/// <summary>
	/// Domain no-op (e.g. an email whose invitation was revoked before send): the row
	/// is deleted exactly like Success, but never dead-lettered, and counted separately.
	/// </summary>
	public sealed record Cancelled(string Reason) : JobOutcome;

	/// <summary>
	/// Transient failure. The engine requeues with its own SQL-time backoff;
	/// <paramref name="DelayOverride"/> (e.g. a provider Retry-After) wins over the
	/// computed backoff when longer. <paramref name="Error"/> is persisted (bounded)
	/// into last_error.
	/// </summary>
	public sealed record Retry(TimeSpan? DelayOverride = null, string? Error = null) : JobOutcome;

	/// <summary>
	/// Terminal failure regardless of remaining attempts: malformed payload, unknown
	/// job type, classified permanent provider error. Goes straight to the DLQ.
	/// </summary>
	public sealed record PermanentFailure(string Reason) : JobOutcome;

	public static readonly Success Succeeded = new();
}
