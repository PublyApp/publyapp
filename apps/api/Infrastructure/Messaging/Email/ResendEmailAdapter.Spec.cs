using System.Net;
using System.Text.Json;

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

	[Fact]
	public async Task ItShouldRejectSameIdempotencyKeyWithDifferentSubject() {
		// The payload comparison must cover the whole body, not just the recipient:
		// a key reused with the same To but a different Subject is a different email
		// and the provider rejects it (409 invalid_idempotent_request), never serving
		// the cached reply for a body it has not seen. A fake that only watched `to`
		// would stay green on the To-variation test while accepting this silently.
		var fake = new FakeResendClient {
			EmailSendResponse = new ResendResponse<Guid>(Guid.NewGuid(), new ResendRateLimit())
		};
		var adapter = new ResendEmailAdapter(fake);

		await adapter.SendAsync(Request(), "same-idem-key");
		fake.ProviderCallCount.Should().Be(1);

		var act = async () => await adapter.SendAsync(Request(subject: "different subject"), "same-idem-key");

		var thrown = await act.Should().ThrowAsync<EmailProviderPermanentException>(
			because: "the Subject field differs between the first send and the reuse of this key"
		);
		thrown.Which.Code.Should().Be("provider_rejected:InvalidIdempotentRequest:409");
		fake.ProviderCallCount.Should().Be(1);
	}

	[Fact]
	public async Task ItShouldOnlyMapTheFourKnownPayloadFields() {
		// #1988: the adapter maps exactly four fields onto Resend.EmailMessage.
		// Ten more properties exist on the SDK type (cc, bcc, reply_to, text, headers,
		// attachments, tags, template, scheduled_at, created_at), each [JsonIgnore(WhenWritingNull)].
		// Adding any of them to the adapter silently widens the idempotency payload contract —
		// the same key with the new field set would be a different email, and Resend would
		// serve the first send's cached response for the second. This test fails loudly when
		// the contract widens, naming the unexpected field and pointing at #1988.
		//
		// Mutation: add `TextBody = "..."` to SendAsync body → this test names "TextBody"
		// and fails. Either add a rejection spec for the new field, or state why it is exempt.
		var fake = new FakeResendClient {
			EmailSendResponse = new ResendResponse<Guid>(Guid.NewGuid(), new ResendRateLimit())
		};
		var adapter = new ResendEmailAdapter(fake);

		await adapter.SendAsync(Request(), "idem-key");

		var message = fake.LastEmailMessage;
		message.Should().NotBeNull("the adapter must have called EmailSendAsync with a message");

		// Serialize to JSON exactly as the Resend SDK would: this is what reaches the wire.
		// Count the fields that would actually be sent (non-null, non-empty collections).
		var json = JsonSerializer.Serialize(message);
		using var doc = JsonDocument.Parse(json);
		var payloadFields = doc.RootElement.EnumerateObject().Select(p => p.Name).ToList();

		// The SDK serialises with camelCase: HtmlBody → "html", not "html_body".
		var knownWireFields = new HashSet<string> { "from", "html", "subject", "to" };
		var payloadFieldsSet = payloadFields.ToHashSet();

		payloadFieldsSet.Should()
			.BeSubsetOf(knownWireFields,
				$"the payload contract is exactly [{string.Join(", ", knownWireFields)}]. "
					+ $"Found: [{string.Join(", ", payloadFields.OrderBy(f => f))}]. "
					+ "Either add a rejection spec for the new field, or state why it is exempt (see #1988)."
			);

		var missingFields = knownWireFields.Except(payloadFieldsSet).ToList();
		missingFields.Should().BeEmpty(
			$"the payload must include all four fields. Missing: [{string.Join(", ", missingFields)}]. "
				+ "(see #1988)"
		);
	}

	[Fact]
	public async Task ItShouldRejectSameIdempotencyKeyWithDifferentHtmlBody() {
		var fake = new FakeResendClient {
			EmailSendResponse = new ResendResponse<Guid>(Guid.NewGuid(), new ResendRateLimit())
		};
		var adapter = new ResendEmailAdapter(fake);

		await adapter.SendAsync(Request(), "same-idem-key");
		fake.ProviderCallCount.Should().Be(1);

		var act = async () => await adapter.SendAsync(Request(htmlBody: "<p>different body</p>"), "same-idem-key");

		var thrown = await act.Should().ThrowAsync<EmailProviderPermanentException>(
			because: "the HtmlBody field differs between the first send and the reuse of this key"
		);
		thrown.Which.Code.Should().Be("provider_rejected:InvalidIdempotentRequest:409");
		fake.ProviderCallCount.Should().Be(1);
	}

	[Fact]
	public async Task ItShouldRejectSameIdempotencyKeyWithDifferentFrom() {
		// Same To, same Subject, same HtmlBody, different From: still a different
		// email. This closes the last field of the adapter's payload (the whole
		// body is exactly from/to/subject/html) so a comparison that silently
		// drops ANY single field is caught red, not left as a green mutation.
		var fake = new FakeResendClient {
			EmailSendResponse = new ResendResponse<Guid>(Guid.NewGuid(), new ResendRateLimit())
		};
		var adapter = new ResendEmailAdapter(fake);

		await adapter.SendAsync(Request(), "same-idem-key");
		fake.ProviderCallCount.Should().Be(1);

		var act = async () => await adapter.SendAsync(Request(from: "different@example.com"), "same-idem-key");

		var thrown = await act.Should().ThrowAsync<EmailProviderPermanentException>(
			because: "the From field differs between the first send and the reuse of this key"
		);
		thrown.Which.Code.Should().Be("provider_rejected:InvalidIdempotentRequest:409");
		fake.ProviderCallCount.Should().Be(1);
	}

	private static EmailRequest Request(
		string? to = null,
		string? from = null,
		string? subject = null,
		string? htmlBody = null
	) {
		return new EmailRequest {
			To = to ?? "to@example.com",
			From = from ?? "from@example.com",
			Subject = subject ?? "subject",
			HtmlBody = htmlBody ?? "<p>body</p>"
		};
	}
}
