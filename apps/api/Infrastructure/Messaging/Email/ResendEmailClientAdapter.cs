using Resend;

namespace PublyApp.Api.Infrastructure.Messaging.Email;

/// <summary>
/// Adapts the Resend SDK's <see cref="IResend"/> to the repository-owned
/// <see cref="IResendEmailClient"/> port, forwarding only the two <c>EmailSendAsync</c>
/// overloads the application uses. This is the ONLY file that references <see cref="IResend"/>
/// directly — a future Resend SDK upgrade breaks here alone, never in tests or specs.
/// </summary>
public sealed class ResendEmailClientAdapter : IResendEmailClient {
	private readonly IResend _resendClient;

	public ResendEmailClientAdapter(IResend resendClient) {
		_resendClient = resendClient;
	}

	public async Task<ResendResponse<Guid>> EmailSendAsync(
		EmailMessage email,
		CancellationToken cancellationToken = default
	) {
		return await _resendClient.EmailSendAsync(email, cancellationToken);
	}

	public async Task<ResendResponse<Guid>> EmailSendAsync(
		string idempotencyKey,
		EmailMessage email,
		CancellationToken cancellationToken = default
	) {
		return await _resendClient.EmailSendAsync(idempotencyKey, email, cancellationToken);
	}
}
