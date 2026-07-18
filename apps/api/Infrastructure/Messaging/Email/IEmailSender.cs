namespace PublyApp.Api.Infrastructure.Messaging.Email;

// Simpler version for basic use cases. Serialized verbatim into email_prepared_sends
// as the frozen envelope (design §4.5, F7) — retries resend these exact bytes.
public class EmailRequest {
	public required string To { get; set; }
	public required string From { get; set; }
	public required string Subject { get; set; }
	public required string HtmlBody { get; set; }
}

/// <summary>
/// The low-level provider port. Corrected F3 contract (design §5.4): a failure THROWS a
/// classified <see cref="EmailProviderException"/> — never a silent
/// success-flag-false — and a success returns an <see cref="EmailSendReceipt"/> the
/// caller must consume. The <c>idempotencyKey</c> is the job-stable provider
/// idempotency key (§4.5): passed on every retry so byte-identical resends are
/// deduplicated within the provider's window.
/// </summary>
public interface IEmailSender {
	// The cancellationToken is the job's execution token: the adapter links it with an
	// explicit 30 s provider-I/O bound (design §5.4 step 4) so a blocked send neither
	// hangs the worker nor outlives host shutdown.
	Task<EmailSendReceipt> SendAsync(
		EmailRequest request,
		string? idempotencyKey = null,
		CancellationToken cancellationToken = default
	);
}
