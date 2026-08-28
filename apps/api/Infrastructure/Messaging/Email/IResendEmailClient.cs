using Resend;

namespace PublyApp.Api.Infrastructure.Messaging.Email;

/// <summary>
/// Repository-owned port over the Resend SDK that exposes ONLY the email-send members
/// the application actually uses. This shrinks the test seam: the test fake in
/// <c>Lib.Testing.Fakes</c> implements this interface (not the third-party
/// <see cref="IResend"/>), and the real <see cref="ResendEmailClientAdapter"/> wraps
/// <see cref="IResend"/> behind it. A future Resend SDK upgrade can only break the
/// single adapter file, never the test fakes or specs.
/// </summary>
public interface IResendEmailClient {
	Task<ResendResponse<Guid>> EmailSendAsync(
		EmailMessage email,
		CancellationToken cancellationToken = default
	);

	Task<ResendResponse<Guid>> EmailSendAsync(
		string idempotencyKey,
		EmailMessage email,
		CancellationToken cancellationToken = default
	);
}
