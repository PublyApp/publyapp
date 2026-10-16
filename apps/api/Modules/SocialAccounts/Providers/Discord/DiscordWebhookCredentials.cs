using System.Text.Json;

using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Discord;

/// <summary>
/// What a Discord webhook account stores in <c>protected_credentials</c>: the
/// webhook URL (a secret) and the server id Discord reported, used only to build a
/// link to a posted message. Encrypted under the Discord purpose.
/// </summary>
public sealed record DiscordWebhookCredentials(string WebhookUrl, string? GuildId) {
	private static readonly JsonSerializerOptions _Json = new(JsonSerializerDefaults.Web);

	// Never print the URL (a record's synthesized ToString would).
	public sealed override string ToString() {
		return $"DiscordWebhookCredentials {{ WebhookUrl = {DiscordWebhookUrl.Parse(this.WebhookUrl)?.Masked ?? "[REDACTED]"} }}";
	}

	public string Protect(ICredentialProtector protector) {
		return protector.Protect(
			JsonSerializer.Serialize(this, DiscordWebhookCredentials._Json), SocialProvider.DiscordWebhook
		);
	}

	/// <summary>Null when nothing usable is stored (absent, tampered or no longer a valid webhook URL).</summary>
	public static DiscordWebhookCredentials? Unprotect(ICredentialProtector protector, string? protectedText) {
		var result = protector.Unprotect(protectedText, SocialProvider.DiscordWebhook);
		if (result.Outcome != UnprotectOutcome.Ok || result.Plaintext is null) {
			return null;
		}

		try {
			var credentials = JsonSerializer.Deserialize<DiscordWebhookCredentials>(
				result.Plaintext, DiscordWebhookCredentials._Json
			);
			return credentials is not null && DiscordWebhookUrl.Parse(credentials.WebhookUrl) is not null
				? credentials
				: null;
		} catch (JsonException) {
			return null;
		}
	}
}
