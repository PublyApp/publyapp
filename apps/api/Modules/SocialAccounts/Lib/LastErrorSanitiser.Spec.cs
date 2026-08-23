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

	[Fact]
	public void ItShouldRedactBearerToken() {
		var raw = "Request failed: Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.signature";
		var sanitised = LastErrorSanitiser.Sanitize(raw)!;
		sanitised.Should().NotContain("eyJhbGciOiJIUzI1NiJ9.signature");
		sanitised.Should().Contain("[redacted]");
	}

	[Fact]
	public void ItShouldRedactAccessTokenInQueryString() {
		var raw = "Response from https://api.example.com/callback?access_token=abc123secret&state=x";
		var sanitised = LastErrorSanitiser.Sanitize(raw)!;
		sanitised.Should().NotContain("abc123secret");
		sanitised.Should().Contain("access_token=[redacted]",
			"the field name must survive so the operator knows WHICH field leaked");
	}

	[Fact]
	public void ItShouldRedactTokenInQueryString() {
		var raw = "Exchange failed: token=ghp_abcdef1234567890";
		var sanitised = LastErrorSanitiser.Sanitize(raw)!;
		sanitised.Should().NotContain("ghp_abcdef1234567890");
		sanitised.Should().Contain("token=[redacted]",
			"the field name must survive so the operator knows WHICH field leaked");
	}

	[Fact]
	public void ItShouldRedactJsonAccessToken() {
		var raw = "OAuth error: \"access_token\": \"sk-proj-abcdef\"";
		var sanitised = LastErrorSanitiser.Sanitize(raw)!;
		sanitised.Should().NotContain("sk-proj-abcdef");
		sanitised.Should().Contain("\"access_token\": \"[redacted]\"",
			"the field name must survive so the operator knows WHICH field leaked");
	}

	[Fact]
	public void ItShouldRedactJsonRefreshToken() {
		var raw = "Token refresh failed: \"refresh_token\": \"rt_verysecret123\"";
		var sanitised = LastErrorSanitiser.Sanitize(raw)!;
		sanitised.Should().NotContain("rt_verysecret123");
		sanitised.Should().Contain("\"refresh_token\": \"[redacted]\"",
			"the field name must survive so the operator knows WHICH field leaked");
	}

	[Fact]
	public void ItShouldRedactJsonClientSecret() {
		var raw = "Client auth failed: \"client_secret\": \"cs_prod_xyz789\"";
		var sanitised = LastErrorSanitiser.Sanitize(raw)!;
		sanitised.Should().NotContain("cs_prod_xyz789");
		sanitised.Should().Contain("\"client_secret\": \"[redacted]\"",
			"the field name must survive so the operator knows WHICH field leaked");
	}

	[Fact]
	public void ItShouldLeaveCleanMessagesUntouched() {
		var raw = "Bluesky API returned 401 Unauthorized";
		LastErrorSanitiser.Sanitize(raw).Should().Be(raw);
	}
}
