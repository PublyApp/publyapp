using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Modules.Jobs.Handlers.Staff;

// Fail-closed payload redaction (#636, brief non-negotiable fix #6): staff-facing
// job payloads are exposed ONLY for the real seeded, payload-free system job keys.
// Everything else — email families, social-account families, messaging prepared
// sends, and any UNKNOWN future key — is fully redacted by default.
public sealed class PayloadRedactionSpec {
	private const string RedactedEnvelope =
		"""{"redacted":true,"reason":"sensitive-payload-staff-redacted"}""";

	[Fact]
	public void ItShouldRedactEmailDotJobTypes() {
		PayloadRedaction.Redact(
			"email.tenant-invitation.v1",
			"""{"to":["a@b.c"],"body":"secret"}"""
		).Should().Be(RedactedEnvelope);
	}

	[Fact]
	public void ItShouldRedactEmailDashJobTypes() {
		PayloadRedaction.Redact(
			"email-prepared-sends-retention",
			"""{"prepared":1}"""
		).Should().Be(RedactedEnvelope);
	}

	[Fact]
	public void ItShouldRedactSocialAccountJobTypesInBothSpellings() {
		PayloadRedaction.Redact("socialaccount.foo", "{}")
			.Should().Be(RedactedEnvelope);
		PayloadRedaction.Redact("social-account-foo", "{}")
			.Should().Be(RedactedEnvelope);
	}

	[Fact]
	public void ItShouldRedactMessagingJobTypes() {
		PayloadRedaction.Redact(
			"messaging.prepared-send-state",
			"""{"token":"t"}"""
		).Should().Be(RedactedEnvelope);
	}

	[Fact]
	public void ItShouldRedactUnknownJobTypesByDefault() {
		PayloadRedaction.Redact("bogus.unknown", """{"a":1}""")
			.Should().Be(RedactedEnvelope,
				"fail-closed: an unlisted key never leaks its payload");
	}

	[Fact]
	public void ItShouldPassThroughSafeSeededJobKeys() {
		foreach (var jobKey in new[] {
			"upload-orphan-reclaim",
			"session-cleanup",
			"job-dead-letter-retention",
			"system-job-occurrence-retention",
			"email-log-retention",
		}) {
			PayloadRedaction.Redact(jobKey, """{"k":1}""")
				.Should().Be("""{"k":1}""");
		}
	}

	[Fact]
	public void ItShouldReturnEmptyForNullOrEmptyPayload() {
		PayloadRedaction.Redact("session-cleanup", null)
			.Should().BeEmpty();
		PayloadRedaction.Redact("bogus.unknown", "")
			.Should().BeEmpty();
	}
}
