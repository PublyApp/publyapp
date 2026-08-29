using PublyApp.Api.Infrastructure.Messaging.Email;

using Resend;

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

	/// <summary>
	/// How many times the provider has actually been called (due to non-duplicate
	/// idempotency keys). Used to verify idempotency behavior in tests.
	/// </summary>
	public int ProviderCallCount { get; private set; }

	/// <summary>
	/// Set of idempotency keys that have been seen by the provider. Once a key
	/// is seen, subsequent calls with the same key are deduplicated (no provider
	/// call is made).
	/// </summary>
	public ISet<string> SeenIdempotencyKeys { get; } = new HashSet<string>();

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

		ProviderCallCount++;
		return EmailSendResponse;
	}

	public Task<ResendResponse<Guid>> EmailSendAsync(
		string idempotencyKey,
		EmailMessage email,
		CancellationToken cancellationToken = default
	) {
		// If this idempotency key was already seen, skip the provider call
		// (simulating idempotent deduplication)
		if (!string.IsNullOrEmpty(idempotencyKey) && SeenIdempotencyKeys.Contains(idempotencyKey)) {
			// Return a fabricated response without calling the provider
			return Task.FromResult(EmailSendResponse);
		}

		// Track this key as seen
		if (!string.IsNullOrEmpty(idempotencyKey)) {
			SeenIdempotencyKeys.Add(idempotencyKey);
		}

		// Make the actual provider call
		return EmailSendAsync(email, cancellationToken);
	}
}
