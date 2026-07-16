using System.Text.Json;

namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// The per-job execution context handed to an <see cref="IJobHandler"/>. Execution is
/// at-least-once: a handler may see the same job again after a crash or a lost lease,
/// so everything it does must be idempotent (design §6, hard contract).
/// </summary>
public sealed class JobContext {
	/// <summary>The job_queue row id — stable across retries of the same job.</summary>
	public required Guid JobId { get; init; }

	/// <summary>
	/// The versioned dispatch key this job was enqueued under
	/// (e.g. "email.tenant-invitation.v1" — F14).
	/// </summary>
	public required string JobType { get; init; }

	/// <summary>
	/// Raw JSON payload as persisted; read it via <see cref="DeserializePayload{T}"/>.
	/// </summary>
	public required string Payload { get; init; }

	/// <summary>
	/// The number of PRIOR failed attempts: 0 on the first run, 1 when running after
	/// one retry, and so on. A run abandoned by host shutdown or lease loss does NOT
	/// consume an attempt.
	/// </summary>
	public required int Attempts { get; init; }

	/// <summary>Per-row retry ceiling; when Attempts + 1 reaches it, a failure is terminal.</summary>
	public required int MaxAttempts { get; init; }

	// Provenance envelope (F15): who/where this job came from, for tenant isolation
	// and audit in handlers that need it. Null for system-originated jobs.
	public Guid? TenantId { get; init; }
	public Guid? ActorUserId { get; init; }
	public string? CorrelationId { get; init; }

	/// <summary>
	/// The final classified error, populated only when the engine invokes
	/// <see cref="IJobHandler.OnTerminalFailureAsync"/> (bounded and sanitized — F20).
	/// Null during <see cref="IJobHandler.HandleAsync"/>.
	/// </summary>
	public string? LastError { get; init; }

	/// <summary>
	/// Deserializes the JSON payload via the canonical <see cref="JobJson"/> contract
	/// (camelCase wire form, case-insensitive read, required members enforced — F2).
	/// A malformed payload throws <see cref="JsonException"/>, which the engine
	/// classifies as a <see cref="JobOutcome.PermanentFailure"/> — never a retry.
	/// </summary>
	public T DeserializePayload<T>() {
		return JobJson.Deserialize<T>(Payload);
	}
}
