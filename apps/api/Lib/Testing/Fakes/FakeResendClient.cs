using Resend;

using PublyApp.Api.Infrastructure.Messaging.Email;

namespace PublyApp.Api.Lib.Testing.Fakes;

/// <summary>
/// Test double for the repository-owned <see cref="IResendEmailClient"/> port. Only the
/// two <c>EmailSendAsync</c> overloads are functional: they drive a fabricated
/// <see cref="ResendResponse{T}"/> (the F3 non-throwing unsuccessful-response shape,
/// design §5.4) and the 30 s provider-timeout classification (§5.4 step 4) without a
/// real network call. Implementing the repo port (not the third-party <see cref="IResend"/>)
/// means SDK upgrades cannot break this file.
/// </summary>
public sealed class FakeResendClient : IResendEmailClient {
	/// <summary>
	/// What <c>EmailSendAsync</c> returns once <see cref="Delay"/> elapses. Defaults to a
	/// successful send carrying a random message id; set an exception-carrying response to
	/// exercise the F3 unsuccessful path (<c>Success = false</c>).
	/// </summary>
	public ResendResponse<Guid> EmailSendResponse { get; set; } =
		new(Guid.NewGuid(), new ResendRateLimit());

	/// <summary>
	/// Optional SDK exception thrown before a response is returned, matching the default
	/// <c>ResendClientOptions.ThrowExceptions = true</c> behavior.
	/// </summary>
	public ResendException? ExceptionToThrow { get; set; }

	/// <summary>
	/// Simulated provider latency, awaited honoring the caller's token so the adapter's
	/// linked 30 s bound can cancel it. Zero (default) completes immediately.
	/// </summary>
	public TimeSpan Delay { get; set; } = TimeSpan.Zero;

	public async Task<ResendResponse<Guid>> EmailSendAsync(
		EmailMessage email,
		CancellationToken cancellationToken = default
	) {
		if (Delay > TimeSpan.Zero) {
			await Task.Delay(Delay, cancellationToken);
		}

		if (ExceptionToThrow is not null) {
			throw ExceptionToThrow;
		}

		return EmailSendResponse;
	}

	public Task<ResendResponse<Guid>> EmailSendAsync(
		string idempotencyKey,
		EmailMessage email,
		CancellationToken cancellationToken = default
	) {
		return EmailSendAsync(email, cancellationToken);
	}
}
