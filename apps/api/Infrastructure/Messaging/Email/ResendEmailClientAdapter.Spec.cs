using System.Net;

using FluentAssertions;

using Moq;

using Resend;

using Xunit;

namespace PublyApp.Api.Infrastructure.Messaging.Email;

/// <summary>
/// Smoke tests for <see cref="ResendEmailClientAdapter"/>: verifies that the adapter
/// forwards parameters to the SDK without alteration and that SDK exceptions propagate
/// (rather than being swallowed and replaced with a fabricated success).
///
/// These specs drive a <b>mock <see cref="IResend"/></b> — not
	/// <see cref="Lib.Testing.Fakes.FakeResendClient"/>
/// — so they exercise the adapter's thin wire between the application port
/// (<see cref="IResendEmailClient"/>) and the third-party SDK (<see cref="IResend"/>).
/// </summary>
public sealed class ResendEmailClientAdapterSpec {
	[Fact]
	public async Task ItShouldForwardEmailMessageParametersWithoutAlteration() {
		// Arrange
		var expectedMessageId = Guid.NewGuid();
		EmailMessage? capturedMessage = null;
		var mockResend = new Mock<IResend>();
		mockResend
			.Setup(r => r.EmailSendAsync(It.IsAny<EmailMessage>(), It.IsAny<CancellationToken>()))
			.Callback<EmailMessage, CancellationToken>((msg, _) => capturedMessage = msg)
			.ReturnsAsync(new ResendResponse<Guid>(expectedMessageId, new ResendRateLimit()));

		var adapter = new ResendEmailClientAdapter(mockResend.Object);

		var email = new EmailMessage {
			From = "sender@example.com",
			To = "recipient@example.com",
			Subject = "Test Subject",
			HtmlBody = "<p>Test Body</p>"
		};

		// Act
		var response = await adapter.EmailSendAsync(email);

		// Assert: parameters were forwarded verbatim (access EmailAddress.Email for the string value)
		capturedMessage.Should().NotBeNull();
		var msg = capturedMessage!;
		msg.From!.Email.Should().Be("sender@example.com");
		msg.To.First()!.Email.Should().Be("recipient@example.com");
		msg.Subject.Should().Be("Test Subject");
		msg.HtmlBody.Should().Be("<p>Test Body</p>");
		response.Content.Should().Be(expectedMessageId);
	}

	[Fact]
	public async Task ItShouldForwardIdempotencyKeyToTheIdempotentOverload() {
		// Arrange
		var idempotencyKey = "idem-1234-abcd";
		var expectedMessageId = Guid.NewGuid();
		string? capturedKey = null;
		var mockResend = new Mock<IResend>();
		mockResend
			.Setup(r => r.EmailSendAsync(It.IsAny<string>(), It.IsAny<EmailMessage>(), It.IsAny<CancellationToken>()))
			.Callback<string, EmailMessage, CancellationToken>((key, _, _) => capturedKey = key)
			.ReturnsAsync(new ResendResponse<Guid>(expectedMessageId, new ResendRateLimit()));

		var adapter = new ResendEmailClientAdapter(mockResend.Object);

		var email = new EmailMessage {
			From = "sender@example.com",
			To = "recipient@example.com",
			Subject = "Idempotent Test",
			HtmlBody = "<p>Body</p>"
		};

		// Act
		var response = await adapter.EmailSendAsync(idempotencyKey, email);

		// Assert: idempotency key was forwarded to the idempotent SDK overload
		capturedKey.Should().Be(idempotencyKey);
		response.Content.Should().Be(expectedMessageId);
	}

	[Fact]
	public async Task ItShouldNotSwallowSdkExceptions() {
		// Mutation adverse: if the adapter caught all exceptions and returned a fabricated
		// success (ResendResponse<Guid>), this test would remain green while email sending
		// is silently broken in production. The adapter MUST NOT catch and swallow SDK
		// exceptions — they must propagate to the caller.
		var sdkException = new ResendException(
			HttpStatusCode.InternalServerError,
			ErrorType.ApplicationError,
			"upstream error"
		);
		var mockResend = new Mock<IResend>();
		mockResend
			.Setup(r => r.EmailSendAsync(It.IsAny<EmailMessage>(), It.IsAny<CancellationToken>()))
			.ThrowsAsync(sdkException);

		var adapter = new ResendEmailClientAdapter(mockResend.Object);

		var email = new EmailMessage {
			From = "sender@example.com",
			To = "recipient@example.com",
			Subject = "Test",
			HtmlBody = "<p>body</p>"
		};

		// Act & Assert
		var act = async () => await adapter.EmailSendAsync(email);
		var thrown = await act.Should().ThrowAsync<ResendException>();
		thrown.Subject.Single().Should().BeSameAs(sdkException);
	}

	[Fact]
	public async Task ItShouldNotSwallowSdkExceptionsOnIdempotentOverload() {
		// Same mutation adverse as above, but for the idempotent overload.
		var sdkException = new ResendException(
			HttpStatusCode.ServiceUnavailable,
			ErrorType.HttpSendFailed,
			"network unreachable"
		);
		var mockResend = new Mock<IResend>();
		mockResend
			.Setup(r => r.EmailSendAsync(It.IsAny<string>(), It.IsAny<EmailMessage>(), It.IsAny<CancellationToken>()))
			.ThrowsAsync(sdkException);

		var adapter = new ResendEmailClientAdapter(mockResend.Object);

		var email = new EmailMessage {
			From = "sender@example.com",
			To = "recipient@example.com",
			Subject = "Test",
			HtmlBody = "<p>body</p>"
		};

		// Act & Assert
		var act = async () => await adapter.EmailSendAsync("idem-key", email);
		var thrown = await act.Should().ThrowAsync<ResendException>();
		thrown.Subject.Single().Should().BeSameAs(sdkException);
	}
}
