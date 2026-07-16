using System.Text.Json;

namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// The per-job execution context handed to an <see cref="IJobHandler"/>. Exposes the
/// claimed job's identity and its JSON payload, deserialized on demand into the
/// handler's expected shape.
/// </summary>
public sealed class JobContext {
	public required Guid JobId { get; init; }
	public required string JobType { get; init; }
	public required string Payload { get; init; }
	public required int Attempts { get; init; }

	/// <summary>
	/// Deserializes the JSON payload into <typeparamref name="T"/>. Throws when the
	/// payload cannot be materialized (a malformed payload is a failure, retried and
	/// eventually dead-lettered by the processor rather than silently swallowed).
	/// </summary>
	public T DeserializePayload<T>() {
		var deserialized = JsonSerializer.Deserialize<T>(Payload);

		if (deserialized is null) {
			throw new InvalidOperationException(
				$"Job {JobId} payload could not be deserialized to {typeof(T).Name}"
			);
		}

		return deserialized;
	}
}
