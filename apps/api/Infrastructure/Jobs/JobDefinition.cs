namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// The trusted description of one enqueueable job kind (design §5.1, F15/F14).
/// Instances live in static catalogs beside their handlers (e.g. a future
/// <c>InvitationEmailJobs.TenantInvitationV1</c>) and own the versioned
/// <c>job_type</c> string, default priority / max-attempts policy, and payload
/// validation. Producers can only enqueue through a definition via
/// <see cref="IJobEnqueuer"/> — never by writing the table directly.
/// </summary>
public sealed class JobDefinition<TPayload> {
	/// <summary>Versioned dispatch key, e.g. "email.tenant-invitation.v1" (F14).</summary>
	public required string JobType { get; init; }

	/// <summary>0–1000 (DB CHECK); email jobs enqueue at 100, bulk work at 0 (§4.1).</summary>
	public int Priority { get; init; }

	/// <summary>1–50 (DB CHECK); default spans ≈ 2 h of jittered retries (§5.1).</summary>
	public int MaxAttempts { get; init; } = JobBackoff.DefaultMaxAttempts;

	/// <summary>
	/// Optional extra payload validation, invoked at enqueue after the built-in
	/// empty-ID rejection; throw to refuse the enqueue.
	/// </summary>
	public Action<TPayload>? Validate { get; init; }

	/// <summary>
	/// F2 contract: required members are enforced by the serializer on read; the
	/// enqueue side additionally rejects <see cref="Guid.Empty"/> IDs so a job that
	/// could never execute is refused before it is persisted.
	/// </summary>
	public void ValidatePayload(TPayload payload) {
		if (payload is null) {
			throw new InvalidOperationException(
				$"Job '{JobType}' payload must not be null."
			);
		}

		foreach (var property in typeof(TPayload).GetProperties()) {
			object? value = property.GetValue(payload);

			if (value is Guid guidValue && guidValue == Guid.Empty) {
				throw new InvalidOperationException(
					$"Job '{JobType}' payload property '{property.Name}' is Guid.Empty."
				);
			}
		}

		Validate?.Invoke(payload);
	}
}
