using Resend;

namespace PublyApp.Api.Infrastructure.Messaging.Email;

/// <summary>
/// Adapts the Resend SDK to <see cref="IEmailSender"/> with the corrected F3 contract
/// (design §5.4): a provider rejection is THROWN as a classified
/// <see cref="EmailProviderException"/> — never mapped to a silent success flag — and a
/// success returns the provider message id in an <see cref="EmailSendReceipt"/>. When an
/// idempotency key is supplied the idempotent overload is used, so a retry that resends
/// byte-identical bytes is deduplicated by the provider (§4.5).
/// </summary>
public class ResendEmailAdapter : IEmailSender {
	// Explicit provider HTTP timeout (design §5.4 step 3/step 4): the lock window over a
	// network send is bounded so a blocked provider call can never stall the worker or a
	// waiting revoke indefinitely. A timeout is a TRANSIENT fault → Retry, never Permanent.
	private static readonly TimeSpan DefaultProviderTimeout = TimeSpan.FromSeconds(30);

	private readonly IResendEmailClient _resendClient;
	private readonly TimeSpan _providerTimeout;

	public ResendEmailAdapter(IResendEmailClient resendClient)
		: this(resendClient, DefaultProviderTimeout) {
	}

	// Overload with an explicit bound: production always uses the 30 s default above;
	// specs pass a tiny bound to drive the timeout->Retry classification without waiting.
	public ResendEmailAdapter(IResendEmailClient resendClient, TimeSpan providerTimeout) {
		_resendClient = resendClient;
		_providerTimeout = providerTimeout;
	}

	public async Task<EmailSendReceipt> SendAsync(
		EmailRequest request,
		string? idempotencyKey = null,
		CancellationToken cancellationToken = default
	) {
		var resendMessage = new Resend.EmailMessage {
			From = request.From,
			To = request.To,
			Subject = request.Subject,
			HtmlBody = request.HtmlBody
		};

		// Bound the provider call at 30 s, linked to the job token so host shutdown still
		// cancels promptly. A trip of the timeout (not the job token) is a transient fault.
		using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
		timeoutSource.CancelAfter(_providerTimeout);

		try {
			var response = string.IsNullOrEmpty(idempotencyKey)
				? await _resendClient.EmailSendAsync(resendMessage, timeoutSource.Token)
				: await _resendClient.EmailSendAsync(idempotencyKey, resendMessage, timeoutSource.Token);

			if (response.Exception is { } exception) {
				throw Classify(exception, response.Limits?.RetryAfter);
			}

			return new EmailSendReceipt(response.Content.ToString());
		} catch (ResendException ex) {
			// Defensive classification for callers configured with ThrowExceptions=true.
			// Production disables it explicitly, but this boundary remains safe if the SDK
			// option regresses or another IResend implementation throws directly.
			throw Classify(ex, retryAfterSeconds: null);
		} catch (OperationCanceledException) when (
			timeoutSource.IsCancellationRequested && !cancellationToken.IsCancellationRequested
		) {
			// The 30 s provider bound elapsed (not host shutdown): classify as transient so
			// the engine reschedules the send rather than dead-lettering it (§5.4 step 4).
			throw new EmailProviderTransientException("provider_timeout", retryAfter: null);
		}
	}

	// Classify a Resend failure into the engine's transient/permanent taxonomy (F3/F12).
	// Retries cannot fix a 4xx validation/suppression, but network faults, 5xx, and rate
	// limits are worth retrying. The code is STABLE and PII-free (error type + status
	// only) — never the recipient or the provider's raw message body (F20).
	private static EmailProviderException Classify(
		ResendException exception,
		int? retryAfterSeconds
	) {
		var statusText = exception.StatusCode is { } sc
			? ((int)sc).ToString(System.Globalization.CultureInfo.InvariantCulture)
			: "none";
		var code = $"provider_rejected:{exception.ErrorType}:{statusText}";

		var transientErrorTypes = new HashSet<ErrorType> {
			ErrorType.HttpSendFailed,
			ErrorType.MissingResponse,
			ErrorType.RateLimitExceeded,
			ErrorType.DailyQuotaExceeded,
			ErrorType.ConcurrentIdempotentRequests,
			ErrorType.ApplicationError
		};

		bool transient = transientErrorTypes.Contains(exception.ErrorType)
			|| (exception.StatusCode is { } status && (int)status >= 500);

		if (transient) {
			TimeSpan? retryAfter = retryAfterSeconds is { } seconds
				? TimeSpan.FromSeconds(seconds)
				: null;
			return new EmailProviderTransientException(code, retryAfter, exception);
		}

		return new EmailProviderPermanentException(code, exception);
	}
}
