namespace PublyApp.Api.Modules.Jobs.Handlers.Staff;

/// <summary>
/// Allowlist-based, FAIL-CLOSED staff payload exposure (#636, brief non-negotiable
/// fix #6 / verdict-r1 MAJOR finding #5). A job payload is shown to staff ONLY for
/// the real seeded, payload-free system job keys; every other job_type — including
/// any future key nobody has classified yet — returns the redacted envelope.
///
/// Sensitive families (both spellings covered — real job keys use dashes):
/// - <c>email.</c> and <c>email-</c> prefixes: payloads carry email bodies and
///   recipient lists.
/// - <c>socialaccount.</c> and <c>social-account-</c> prefixes: the social-accounts
///   family (no system job exists yet; the boundary is here for future workers).
/// - <c>messaging.</c> prefix: prepared-send state carries token-bearing bytes.
/// </summary>
public static class PayloadRedaction {
	/// <summary>The REAL seeded system job keys whose payloads carry no secrets.</summary>
	private static readonly string[] SafeJobKeys = [
		"session-cleanup",
		"email-log-retention",
		"job-dead-letter-retention",
		"system-job-occurrence-retention",
		"upload-orphan-reclaim",
	];

	public const string RedactedReason = "sensitive-payload-staff-redacted";

	public static string RedactedEnvelope {
		get {
			return $$"""{"redacted":true,"reason":"{{RedactedReason}}"}""";
		}
	}

	public static string Redact(string? jobType, string? payloadJson) {
		if (string.IsNullOrEmpty(payloadJson)) {
			return string.Empty;
		}

		var key = jobType ?? string.Empty;
		if (SafeJobKeys.Contains(key)) {
			return payloadJson;
		}

		if (key.StartsWith("email.", StringComparison.Ordinal)
			|| key.StartsWith("email-", StringComparison.Ordinal)
			|| key.StartsWith("socialaccount.", StringComparison.Ordinal)
			|| key.StartsWith("social-account-", StringComparison.Ordinal)
			|| key.StartsWith("messaging.", StringComparison.Ordinal)) {
			return RedactedEnvelope;
		}

		return RedactedEnvelope;
	}
}
