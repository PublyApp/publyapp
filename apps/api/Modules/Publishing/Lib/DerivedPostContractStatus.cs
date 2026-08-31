using System.Text.Json.Serialization;

namespace PublyApp.Api.Modules.Publishing.Lib;

/// <summary>
/// Contract enum for the derived post status wire vocabulary. C# member names
/// match the snake_case wire values exactly so the per-enum
/// <see cref="JsonStringEnumConverter{T}"/> serializes them to the correct
/// contract strings without a second mapping. The domain
/// <see cref="DerivedPostStatus"/> enum stays the single source of truth for
/// stored values; this enum is the wire contract shape (#1521).
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<DerivedPostContractStatus>))]
public enum DerivedPostContractStatus {
	draft = 10,
	scheduled = 20,
	published = 30,
	partial = 40,
	failed = 50,
}
