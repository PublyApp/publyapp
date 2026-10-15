using System.Text.Json;

using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Mastodon;

/// <summary>
/// What a Mastodon account stores in <c>protected_credentials</c>: the instance
/// host and the access token, encrypted together under the Mastodon purpose.
/// Access tokens do not expire, so there is nothing to refresh.
/// </summary>
public sealed record MastodonCredentials(string Host, string AccessToken) {
	private static readonly JsonSerializerOptions _Json = new(JsonSerializerDefaults.Web);

	// Never print the token (a record's synthesized ToString would).
	public sealed override string ToString() {
		return $"MastodonCredentials {{ Host = {this.Host}, AccessToken = [REDACTED] }}";
	}

	public string Protect(ICredentialProtector protector) {
		return protector.Protect(JsonSerializer.Serialize(this, MastodonCredentials._Json), SocialProvider.Mastodon);
	}

	/// <summary>Null when nothing usable is stored (absent, tampered or malformed).</summary>
	public static MastodonCredentials? Unprotect(ICredentialProtector protector, string? protectedText) {
		var result = protector.Unprotect(protectedText, SocialProvider.Mastodon);
		if (result.Outcome != UnprotectOutcome.Ok || result.Plaintext is null) {
			return null;
		}

		try {
			var credentials = JsonSerializer.Deserialize<MastodonCredentials>(
				result.Plaintext, MastodonCredentials._Json
			);
			return credentials is { Host.Length: > 0, AccessToken.Length: > 0 } ? credentials : null;
		} catch (JsonException) {
			return null;
		}
	}
}
