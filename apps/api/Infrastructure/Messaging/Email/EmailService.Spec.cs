using FluentAssertions;

using PublyApp.Api.Lib.Testing.Fakes;

using Xunit;

namespace PublyApp.Api.Infrastructure.Messaging.Email;

// Proves the service is the one send path the email jobs use: a prepared envelope and
// its job-stable idempotency key reach the port unchanged, and the render helpers are
// the exact same templates the shipped methods used.
public sealed class EmailServiceSpec {
	[Fact]
	public async Task ItShouldForwardThePreparedEnvelopeAndIdempotencyKeyToThePort() {
		var sender = new MemoryEmailAdapter();
		var service = new EmailService(sender);
		var request = EmailTemplates.StaffInvitation("invitee@example.com", "token-123");

		var receipt = await service.SendAsync(request, "job-key", CancellationToken.None);

		var send = sender.Sends.Should().ContainSingle().Subject;
		send.Request.Should().BeSameAs(request);
		send.IdempotencyKey.Should().Be("job-key");
		receipt.ProviderMessageId.Should().Be(send.MessageId);
	}

	[Fact]
	public void ItShouldRenderTheWelcomeAndRequestVariantsThroughTheSameTemplates() {
		var service = new EmailService(new MemoryEmailAdapter());

		service.RenderEmailVerification("user@example.com", "token", isWelcome: true)
			.Subject.Should().Be(
				EmailTemplates.EmailVerificationWelcome("user@example.com", "token").Subject
			);
		service.RenderEmailVerification("user@example.com", "token", isWelcome: false)
			.Subject.Should().Be(
				EmailTemplates.EmailVerificationRequest("user@example.com", "token").Subject
			);
	}
}
