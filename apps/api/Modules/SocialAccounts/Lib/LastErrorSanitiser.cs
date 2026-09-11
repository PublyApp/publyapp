namespace PublyApp.Api.Modules.SocialAccounts.Lib;

/// <summary>
/// Sanitises a failure message before it is persisted to SocialAccount.LastError.
/// Caps length at 2 KB and replaces any credential-shaped token with [redacted]
/// so the secret never lands in the database, logs, or audit rows (Epic C §4).
/// </summary>
public static partial class LastErrorSanitiser {
	private const int _MaxBytes = 2048;
	// Matches quoted single-token secrets: '...' with no whitespace.
	[System.Text.RegularExpressions.GeneratedRegex("'[^\\s'\"]{4,}'")]
	private static partial System.Text.RegularExpressions.Regex _SecretPattern();

	// Bearer token: Bearer <token> (unquoted, no whitespace)
	[System.Text.RegularExpressions.GeneratedRegex(@"Bearer\s+[A-Za-z0-9\-._~+/]+=*")]
	private static partial System.Text.RegularExpressions.Regex _BearerPattern();

	// Query-string key=value: access_token=... or token=... (unquoted, no whitespace).
	// Capturing group keeps the field name in the replacement so the operator can tell
	// WHICH field leaked (review r3): access_token=[redacted], not =\u200b[redacted].
	[System.Text.RegularExpressions.GeneratedRegex(@"(access_token|token)=[A-Za-z0-9\-._~+/]+=*")]
	private static partial System.Text.RegularExpressions.Regex _QueryTokenPattern();

	// JSON "access_token": "...", "refresh_token": "...", "client_secret": "..."
	// Capturing group keeps the field name in the replacement (see _QueryTokenPattern).
	[System.Text.RegularExpressions.GeneratedRegex("\"(access_token|refresh_token|client_secret)\"\\s*:\\s*\"[^\"]{4,}\"")]
	private static partial System.Text.RegularExpressions.Regex _JsonSecretPattern();

	public static string? Sanitize(string? raw) {
		if (string.IsNullOrEmpty(raw)) {
			return raw;
		}
		var scrubbed = _SecretPattern().Replace(raw, "'[redacted]'");
		scrubbed = _BearerPattern().Replace(scrubbed, "Bearer [redacted]");
		scrubbed = _QueryTokenPattern().Replace(scrubbed, "$1=[redacted]");
		scrubbed = _JsonSecretPattern().Replace(scrubbed, "\"$1\": \"[redacted]\"");
		var bytes = System.Text.Encoding.UTF8.GetBytes(scrubbed);
		if (bytes.Length <= _MaxBytes) {
			return scrubbed;
		}
		// Trim to the last complete UTF-8 char within budget.
		var truncated = System.Text.Encoding.UTF8.GetString(bytes, 0, _MaxBytes);
		var lastChar = truncated.LastIndexOfAny([' ', '\t', '\n']);
		return lastChar > 0 ? truncated[..lastChar] : truncated;
	}
}
