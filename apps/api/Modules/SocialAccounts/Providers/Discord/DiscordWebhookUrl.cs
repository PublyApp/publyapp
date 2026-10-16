using System.Text.RegularExpressions;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Discord;

/// <summary>
/// A validated Discord incoming-webhook URL (#2175). The URL embeds a secret token,
/// so it is parsed strictly here and rebuilt in canonical form: only
/// <c>https://{discord.com|discordapp.com|ptb/canary.discord.com}/api/webhooks/{id}/{token}</c>
/// is accepted (an optional API version segment is dropped). No port, user info,
/// query, fragment, escape or IP literal can survive, so the host the app talks to
/// is always one of the allowlisted names. <see cref="ToString"/> prints the masked
/// form, never the token.
/// </summary>
public sealed partial record DiscordWebhookUrl(string Id, string Token, string Host) {
	private static readonly HashSet<string> _Hosts = new(StringComparer.Ordinal) {
		"discord.com",
		"discordapp.com",
		"ptb.discord.com",
		"canary.discord.com",
		"ptb.discordapp.com",
		"canary.discordapp.com",
	};

	public const int MaxLength = 300;

	/// <summary>The canonical URL, secret included: only for sending and encrypting.</summary>
	public string Full {
		get { return $"https://{this.Host}/api/webhooks/{this.Id}/{this.Token}"; }
	}

	/// <summary>The only form that may be shown or logged: the token is cut to four characters.</summary>
	public string Masked {
		get { return $"https://{this.Host}/api/webhooks/{this.Id}/{this.Token[..4]}…"; }
	}

	public sealed override string ToString() {
		return this.Masked;
	}

	/// <summary>Null when the text is not a well-formed Discord webhook URL.</summary>
	public static DiscordWebhookUrl? Parse(string? input) {
		if (string.IsNullOrWhiteSpace(input)) {
			return null;
		}

		var text = input.Trim();
		if (text.Length > DiscordWebhookUrl.MaxLength
			|| text.Contains('%') || text.Contains('\\') || text.Any(char.IsControl)) {
			return null;
		}

		if (!Uri.TryCreate(text, UriKind.Absolute, out var uri)
			|| uri.Scheme != Uri.UriSchemeHttps
			|| !uri.IsDefaultPort
			|| uri.UserInfo.Length > 0
			|| uri.Query.Length > 0
			|| uri.Fragment.Length > 0
			|| !DiscordWebhookUrl._Hosts.Contains(uri.IdnHost)) {
			return null;
		}

		var match = DiscordWebhookUrl._PathPattern().Match(uri.AbsolutePath);
		return match.Success
			? new DiscordWebhookUrl(match.Groups["id"].Value, match.Groups["token"].Value, uri.IdnHost)
			: null;
	}

	[GeneratedRegex(
		"^/api/(?:v\\d{1,2}/)?webhooks/(?<id>[0-9]{17,20})/(?<token>[A-Za-z0-9_-]{40,100})$",
		RegexOptions.CultureInvariant
	)]
	private static partial Regex _PathPattern();
}
