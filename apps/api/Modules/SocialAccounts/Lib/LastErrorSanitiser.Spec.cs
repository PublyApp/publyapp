using FluentAssertions;
using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Lib;

public sealed class LastErrorSanitiserSpec {
	[Fact]
	public void ItShouldCapTheMessageWhenLongerThanTwoKilobytes() {
		var huge = new string('x', 10_000);
		LastErrorSanitiser.Sanitize(huge)!.Length.Should().BeLessThanOrEqualTo(2048);
	}

	[Fact]
	public void ItShouldScrubTheSecretWhenPresentInTheMessage() {
		var raw = "Bluesky refused: invalid app password 'hunter2-secret-token-123'";
		var sanitised = LastErrorSanitiser.Sanitize(raw)!;
		sanitised.Should().NotContain("hunter2-secret-token-123");
		sanitised.Should().Contain("[redacted]");
	}

	[Fact]
	public void ItShouldReturnNullWhenTheMessageIsNull() {
		LastErrorSanitiser.Sanitize(null).Should().BeNull();
	}
}
