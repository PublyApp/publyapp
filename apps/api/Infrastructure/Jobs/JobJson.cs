using System.Text.Json;

namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// The canonical payload serializer (design §5.1, F2). One frozen options instance is
/// used by the enqueuer, every handler read, and matched exactly by any
/// migration-emitted JSON (camelCase on the wire: <c>{"invitationId":"…"}</c>). Web
/// defaults give camelCase property naming AND case-insensitive reads; payload
/// records declare members <c>required</c>, so a missing field throws
/// <see cref="JsonException"/> instead of materializing <c>Guid.Empty</c>. The
/// options object is private and frozen — consumers go through
/// <see cref="Serialize{TPayload}"/> / <see cref="Deserialize{TPayload}"/> so no
/// caller can mutate the contract.
/// </summary>
public static class JobJson {
	private static readonly JsonSerializerOptions Options = CreateOptions();

	private static JsonSerializerOptions CreateOptions() {
		var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
		// Freeze immediately (populating the default reflection resolver) so not
		// even code inside this assembly can mutate the wire contract at runtime.
		options.MakeReadOnly(populateMissingResolver: true);
		return options;
	}

	public static string Serialize<TPayload>(TPayload payload) {
		return JsonSerializer.Serialize(payload, Options);
	}

	/// <summary>
	/// Deserializes strictly: a JSON <c>null</c> or a payload missing a required
	/// member throws <see cref="JsonException"/> — which the engine classifies as a
	/// <see cref="JobOutcome.PermanentFailure"/> (no pointless retries on a payload
	/// that can never parse).
	/// </summary>
	public static TPayload Deserialize<TPayload>(string json) {
		var payload = JsonSerializer.Deserialize<TPayload>(json, Options);

		if (payload is null) {
			throw new JsonException(
				$"Payload deserialized to null for {typeof(TPayload).Name}"
			);
		}

		return payload;
	}
}
