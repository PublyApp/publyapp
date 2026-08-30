using System.Net;

using FluentAssertions;

using PublyApp.Api.Lib.Testing.Fakes;

using Resend;

using Xunit;

namespace PublyApp.Api.Infrastructure.Messaging.Email;

// Adapter-level specs for the corrected F3 contract (design §5.4): a provider rejection
// is a THROWN classified EmailProviderException (never a silent success flag), and the
// 30 s provider I/O bound classifies a timeout as transient (Retry, not Permanent). These
// drive a fabricated ResendResponse through the real adapter — no network, no DB.
public sealed class ResendEmailAdapterSpec {
	[Fact]
	public async Task ItShouldReturnReceiptWhenProviderAcceptsTheSend() {
		var messageId = Guid.NewGuid();
		var fake = new FakeResendClient {
			EmailSendResponse = new ResendResponse<Guid>(messageId, new ResendRateLimit())
		};
		var adapter = new ResendEmailAdapter(fake);

		var receipt = await adapter.SendAsync(Request(), "idem-key");

		receipt.ProviderMessageId.Should().Be(messageId.ToString());
	}

	[Fact]
	public async Task ItShouldClassifyThrownValidationErrorAsPermanent() {
		var providerError = new ResendException(
			HttpStatusCode.UnprocessableEntity,
			ErrorType.ValidationError,
			"recipient rejected"
		);
		var fake = new FakeResendClient { ExceptionToThrow = providerError };
		var adapter = new ResendEmailAdapter(fake);

		var act = async () => await adapter.SendAsync(Request(), "idem-key");

		var thrown = await act.Should().ThrowAsync<EmailProviderPermanentException>();
		thrown.Which.Code.Should().Be("provider_rejected:ValidationError:422");
		thrown.Which.InnerException.Should().BeSameAs(providerError);
	}

	[Fact]
	public async Task ItShouldClassifyReturnedValidationErrorAsPermanent() {
		// F3: the SDK returns (not throws) an unsuccessful response carrying a
		// ResendException. The adapter must surface it as a classified permanent failure
		// with the provider error type + status preserved in the stable code.
		var providerError = new ResendException(
			HttpStatusCode.UnprocessableEntity,
			ErrorType.ValidationError,
			"recipient rejected"
		);
		var fake = new FakeResendClient {
			EmailSendResponse = new ResendResponse<Guid>(providerError, new ResendRateLimit())
		};
		var adapter = new ResendEmailAdapter(fake);

		var act = async () => await adapter.SendAsync(Request(), "idem-key");

		var thrown = await act.Should().ThrowAsync<EmailProviderPermanentException>();
		thrown.Which.Code.Should().Be("provider_rejected:ValidationError:422");
		thrown.Which.InnerException.Should().BeSameAs(providerError);
	}

	[Fact]
	public async Task ItShouldClassifyReturnedServerErrorAsTransient() {
		// A 5xx is retryable: the classified exception is transient, not permanent.
		var providerError = new ResendException(
			HttpStatusCode.InternalServerError,
			ErrorType.ApplicationError,
			"upstream error"
		);
		var fake = new FakeResendClient {
			EmailSendResponse = new ResendResponse<Guid>(providerError, new ResendRateLimit())
		};
		var adapter = new ResendEmailAdapter(fake);

		var act = async () => await adapter.SendAsync(Request(), "idem-key");

		var thrown = await act.Should().ThrowAsync<EmailProviderTransientException>();
		thrown.Which.Code.Should().Be("provider_rejected:ApplicationError:500");
	}

	[Fact]
	public async Task ItShouldCarryRetryAfterWhenProviderReturnsRateLimitResponse() {
		var providerError = new ResendException(
			HttpStatusCode.TooManyRequests,
			ErrorType.RateLimitExceeded,
			"rate limited"
		);
		var limits = new ResendRateLimit();
		var retryAfterProperty = typeof(ResendRateLimit)
			.GetProperty(nameof(ResendRateLimit.RetryAfter));
		if (retryAfterProperty is null) {
			throw new InvalidOperationException("Resend RetryAfter property was not found.");
		}

		retryAfterProperty.SetValue(limits, 17);
		var fake = new FakeResendClient {
			EmailSendResponse = new ResendResponse<Guid>(providerError, limits)
		};
		var adapter = new ResendEmailAdapter(fake);

		var act = async () => await adapter.SendAsync(Request(), "idem-key");

		var thrown = await act.Should().ThrowAsync<EmailProviderTransientException>();
		thrown.Which.RetryAfter.Should().Be(TimeSpan.FromSeconds(17));
	}

	[Theory]
	[InlineData(null)]
	[InlineData("")]
	[InlineData("   ")]
	public void ItShouldRejectMissingProviderMessageId(string? providerMessageId) {
		var act = () => new EmailSendReceipt(providerMessageId);

		act.Should().Throw<ArgumentException>();
	}

	[Fact]
	public async Task ItShouldClassifyProviderTimeoutAsTransientRetry() {
		// §5.4 step 4: the provider call is bounded (30 s in production). When the bound
		// elapses the send is classified TRANSIENT (Retry) — never Permanent — so the
		// engine reschedules rather than dead-lettering a merely-slow provider. Driven with
		// a 50 ms bound + a 30 s fake latency so the classification is proven instantly.
		var fake = new FakeResendClient { Delay = TimeSpan.FromSeconds(30) };
		var adapter = new ResendEmailAdapter(fake, TimeSpan.FromMilliseconds(50));

		var act = async () => await adapter.SendAsync(Request(), "idem-key");

		var thrown = await act.Should().ThrowAsync<EmailProviderTransientException>();
		thrown.Which.Code.Should().Be("provider_timeout");
	}

	[Fact]
	public async Task ItShouldRejectSameIdempotencyKeyWithDifferentPayload() {
		// Resend's documented contract (§4.5): reusing an idempotency key with a
		// DIFFERENT request body is a 409 invalid_idempotent_request, never a cached
		// reply. The fake must surface the rejection so a test that reuses a key by
		// mistake fails locally instead of passing against a lying test double.
		var fake = new FakeResendClient {
			EmailSendResponse = new ResendResponse<Guid>(Guid.NewGuid(), new ResendRateLimit())
		};
		var adapter = new ResendEmailAdapter(fake);

		await adapter.SendAsync(Request(), "same-idem-key");
		fake.ProviderCallCount.Should().Be(1);

		var act = async () => await adapter.SendAsync(Request(to: "different@example.com"), "same-idem-key");

		var thrown = await act.Should().ThrowAsync<EmailProviderPermanentException>();
		thrown.Which.Code.Should().Be("provider_rejected:InvalidIdempotentRequest:409");
		fake.ProviderCallCount.Should().Be(1);
	}

	[Fact]
	public async Task ItShouldDedupeDuplicateIdempotencyKeys() {
		// Idempotency key should prevent duplicate sends. First call with the key
		// should reach the provider; second call with same key should not. A THIRD
		// call with a DIFFERENT key must reach the provider again: deduplication is
		// scoped to the key, not to "the first call ever" (#1847 — a fake that
		// ignores keys and caps at one provider call keeps the count at 1 here).
		var messageId = Guid.NewGuid();
		var fake = new FakeResendClient {
			EmailSendResponse = new ResendResponse<Guid>(messageId, new ResendRateLimit())
		};
		var adapter = new ResendEmailAdapter(fake);

		// First send with idempotency key
		await adapter.SendAsync(Request(), "same-idem-key");
		fake.ProviderCallCount.Should().Be(1);

		// Second send with same idempotency key - should be deduplicated
		await adapter.SendAsync(Request(), "same-idem-key");
		fake.ProviderCallCount.Should().Be(1); // Still 1, not incremented

		// Third send with a different idempotency key - must reach the provider again
		await adapter.SendAsync(Request(), "other-idem-key");
		fake.ProviderCallCount.Should().Be(2);
	}

	private static EmailRequest Request(string? to = null) {
		return new EmailRequest {
			To = to ?? "to@example.com",
			From = "from@example.com",
			Subject = "subject",
			HtmlBody = "<p>body</p>"
		};
	}
}
