using System.Text.Json.Serialization;

namespace PublyApp.Api.Modules.Publishing.Entities;

/// <summary>
/// Contract enum for the publication status wire vocabulary. C# member names
/// match the snake_case wire values exactly so the per-enum
/// <see cref="JsonStringEnumConverter{T}"/> serializes them to the correct
/// contract strings without a second mapping. The domain
/// <see cref="PublicationStatus"/> enum stays the single source of truth for
/// stored values; this enum is the wire contract shape (#1521).
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<PublicationContractStatus>))]
public enum PublicationContractStatus {
	scheduled = 10,
	in_progress = 20,
	published = 30,
	failed = 40,
	paused = 50,
}
