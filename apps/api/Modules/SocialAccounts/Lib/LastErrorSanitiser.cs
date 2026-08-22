namespace PublyApp.Api.Modules.SocialAccounts.Lib;

/// <summary>
/// Sanitises a failure message before it is persisted to SocialAccount.LastError.
/// Caps length at 2 KB and replaces any credential-shaped token with [redacted]
/// so the secret never lands in the database, logs, or audit rows (Epic C §4).
/// </summary>
public static partial class LastErrorSanitiser {
	private const int MaxBytes = 2048;
	// Matches quoted single-token secrets: '...' with no whitespace.
	[System.Text.RegularExpressions.GeneratedRegex("'[^\\s'\"]{4,}'")]
	private static partial System.Text.RegularExpressions.Regex SecretPattern();

	public static string? Sanitize(string? raw) {
		if (string.IsNullOrEmpty(raw)) {
			return raw;
		}
		var scrubbed = SecretPattern().Replace(raw, "'[redacted]'");
		var bytes = System.Text.Encoding.UTF8.GetBytes(scrubbed);
		if (bytes.Length <= MaxBytes) {
			return scrubbed;
		}
		// Trim to the last complete UTF-8 char within budget.
		var truncated = System.Text.Encoding.UTF8.GetString(bytes, 0, MaxBytes);
		var lastChar = truncated.LastIndexOfAny([' ', '\t', '\n']);
		return lastChar > 0 ? truncated[..lastChar] : truncated;
	}
}
