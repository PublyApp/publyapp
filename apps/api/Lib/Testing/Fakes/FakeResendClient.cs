using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;

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
	/// Idempotency keys already seen by the provider, each with the payload signature
	/// it was first used with. A key seen again with the SAME payload is deduplicated
	/// (no provider call); a key reused with a DIFFERENT payload is rejected with
	/// 409 invalid_idempotent_request, matching Resend's documented contract (§4.5).
	/// </summary>
	private readonly Dictionary<string, JsonNode> _seenPayloadSignatures = new();

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
		if (!string.IsNullOrEmpty(idempotencyKey)) {
			var signature = PayloadSignature(email);
			if (_seenPayloadSignatures.TryGetValue(idempotencyKey, out var previous)) {
				if (!JsonNode.DeepEquals(previous, signature)) {
					// Same key, different payload: the provider rejects the request
					// (409 invalid_idempotent_request); it never serves the cached
					// reply for a body it has not seen (§4.5).
					var rejected = new ResendException(
						HttpStatusCode.Conflict,
						ErrorType.InvalidIdempotentRequest,
						"Idempotency key was already used with a different payload",
						new ResendRateLimit()
					);
					return Task.FromResult(new ResendResponse<Guid>(rejected, new ResendRateLimit()));
				}

				// Same key, same payload: return the cached response without calling
				// the provider (simulating idempotent deduplication).
				return Task.FromResult(EmailSendResponse);
			}

			_seenPayloadSignatures[idempotencyKey] = signature;
		}

		// New key (or no key): make the actual provider call.
		return EmailSendAsync(email, cancellationToken);
	}

	// Canonical JSON signature of the whole payload, so the fake distinguishes payloads
	// the same way the provider does (the request body must be semantically identical).
	private static JsonNode PayloadSignature(EmailMessage email) {
		var node = JsonSerializer.SerializeToNode(email);
		if (node is null) {
			throw new InvalidOperationException("Failed to serialize the email payload.");
		}

		return node;
	}
}
