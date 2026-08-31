using System.Text.Json.Serialization;

namespace PublyApp.Api.Modules.SocialAccounts.Entities;

/// <summary>
/// Contract enum for the social-account status wire vocabulary. C# member names
/// match the snake_case wire values exactly so the per-enum
/// <see cref="JsonStringEnumConverter{T}"/> serializes them to the correct
/// contract strings without a second mapping. The domain
/// <see cref="SocialAccountStatus"/> enum stays the single source of truth for
/// stored values; this enum is the wire contract shape (#1521).
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<SocialAccountContractStatus>))]
public enum SocialAccountContractStatus {
	active = 10,
	needs_reconnect = 20,
	revoked = 30,
}
