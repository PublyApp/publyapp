namespace PublyApp.Api.Infrastructure.Messaging.Email;

/// <summary>
/// The corrected email-failure contract (design §5.4, F3 — a live pre-existing bug).
/// Before this, <see cref="ResendEmailAdapter"/> mapped provider failures to
/// <c>EmailResult.Success = false</c> and every <see cref="EmailService"/> method
/// discarded the result, so a rejected send was indistinguishable from a delivered
/// one. The fix makes failure impossible to ignore: the adapter throws a classified
/// exception, and a successful send returns an <see cref="EmailSendReceipt"/> the
/// caller must consume. Email job handlers map transient → <c>Retry</c> (honoring the
/// transient exception's RetryAfter) and permanent → <c>PermanentFailure</c>.
///
/// PII discipline: <see cref="Code"/> and <see cref="Exception.Message"/> are STABLE
/// and PII-free (provider error type + status only) — never the recipient address,
/// token, or the provider's raw response body — so they are safe to persist into
/// bounded error columns and job outcome strings (F20). Diagnostic detail belongs in
/// structured log fields, not here.
/// </summary>
public abstract class EmailProviderException : Exception {
	/// <summary>
	/// Stable, PII-free classification code, e.g.
	/// "provider_rejected:ValidationError:422".
	/// </summary>
	public string Code { get; }

	protected EmailProviderException(string code, Exception? innerException = null)
		: base(code, innerException) {
		Code = code;
	}
}

/// <summary>
/// A retryable provider failure: network timeouts, 5xx, or 429 rate limits.
/// <c>RetryAfter</c> carries a provider-supplied backoff hint when present
/// (mapped to <c>JobOutcome.Retry(delayOverride)</c>).
/// </summary>
public sealed class EmailProviderTransientException : EmailProviderException {
	public TimeSpan? RetryAfter { get; }

	public EmailProviderTransientException(
		string code,
		TimeSpan? retryAfter = null,
		Exception? innerException = null
	) : base(code, innerException) {
		RetryAfter = retryAfter;
	}
}

/// <summary>
/// A terminal provider failure that retries cannot fix: validation 4xx, a suppressed
/// or invalid recipient. The engine dead-letters it immediately
/// (<c>JobOutcome.PermanentFailure</c>) rather than burning retry attempts.
/// </summary>
public sealed class EmailProviderPermanentException : EmailProviderException {
	public EmailProviderPermanentException(string code, Exception? innerException = null)
		: base(code, innerException) {
	}
}

/// <summary>
/// Proof of a provider-accepted send (design §5.4/§4.4). The provider message id is
/// persisted into <c>email_log.provider_message_id</c> for support/correlation (F20).
/// "Accepted" is not "delivered" — inbox delivery needs provider webhooks (§10).
/// </summary>
public sealed record EmailSendReceipt {
	public EmailSendReceipt(string? providerMessageId) {
		ArgumentException.ThrowIfNullOrWhiteSpace(providerMessageId);
		ProviderMessageId = providerMessageId;
	}

	public string ProviderMessageId { get; }
}
