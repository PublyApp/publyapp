using System.Text.RegularExpressions;

namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// The ONE boundary where handler-supplied strings and exception messages are made
/// safe for durable storage (job_queue.last_error, job_dead_letter.last_error) and
/// log message templates (F20). Redacts email addresses and long token-like blobs,
/// collapses control characters, and bounds length at 2 KB. The ORIGINAL exception
/// object is never sanitized — it is passed to the structured logger as the exception
/// parameter, where stack traces belong; only rendered strings pass through here.
/// </summary>
public static partial class JobErrorSanitizer {
	public const int MaxLength = 2048;

	[GeneratedRegex(@"[\w.+-]+@[\w-]+(\.[\w-]+)+")]
	private static partial Regex EmailPattern();

	// Long unbroken base64/hex/url-safe runs are token-shaped (reset tokens, API
	// keys, signed payload fragments) — redact wholesale.
	[GeneratedRegex(@"[A-Za-z0-9_\-+/=]{24,}")]
	private static partial Regex TokenPattern();

	[GeneratedRegex(@"[\x00-\x1F]+")]
	private static partial Regex ControlCharacters();

	public static string? Sanitize(string? raw) {
		if (raw is null) {
			return null;
		}

		var safe = ControlCharacters().Replace(raw, " ");
		safe = EmailPattern().Replace(safe, "[redacted-email]");
		safe = TokenPattern().Replace(safe, "[redacted-token]");

		return safe.Length <= MaxLength ? safe : safe[..MaxLength];
	}

	/// <summary>
	/// A durable description of an exception: the stable exception type name (the
	/// safe "code") plus its sanitized message. Never includes stack traces —
	/// those stay on the exception object handed to the structured logger.
	/// </summary>
	public static string Describe(Exception exception) {
		var described = $"{exception.GetType().Name}: {Sanitize(exception.Message)}";

		return described.Length <= MaxLength ? described : described[..MaxLength];
	}
}
