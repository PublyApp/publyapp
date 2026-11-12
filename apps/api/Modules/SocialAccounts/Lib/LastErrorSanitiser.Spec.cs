using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Lib;

public sealed class LastErrorSanitiserSpec {
	[Fact]
	public void ItShouldCapTheMessageWhenLongerThanTwoKilobytes() {
		var huge = new string('x', 10_000);
		LastErrorSanitiser.Sanitize(huge).Required().Length.Should().BeLessThanOrEqualTo(2048);
	}

	[Fact]
	public void ItShouldScrubTheSecretWhenPresentInTheMessage() {
		var raw = "Bluesky refused: invalid app password 'hunter2-secret-token-123'";
		var sanitised = LastErrorSanitiser.Sanitize(raw).Required();
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
		var sanitised = LastErrorSanitiser.Sanitize(raw).Required();
		sanitised.Should().NotContain("eyJhbGciOiJIUzI1NiJ9.signature");
		sanitised.Should().Contain("[redacted]");
	}

	[Fact]
	public void ItShouldRedactAccessTokenInQueryString() {
		var raw = "Response from https://api.example.com/callback?access_token=abc123secret&state=x";
		var sanitised = LastErrorSanitiser.Sanitize(raw).Required();
		sanitised.Should().NotContain("abc123secret");
		sanitised.Should().Contain("access_token=[redacted]",
			"the field name must survive so the operator knows WHICH field leaked");
	}

	[Fact]
	public void ItShouldRedactTokenInQueryString() {
		var raw = "Exchange failed: token=ghp_abcdef1234567890";
		var sanitised = LastErrorSanitiser.Sanitize(raw).Required();
		sanitised.Should().NotContain("ghp_abcdef1234567890");
		sanitised.Should().Contain("token=[redacted]",
			"the field name must survive so the operator knows WHICH field leaked");
	}

	[Fact]
	public void ItShouldRedactJsonAccessToken() {
		var raw = "OAuth error: \"access_token\": \"sk-proj-abcdef\"";
		var sanitised = LastErrorSanitiser.Sanitize(raw).Required();
		sanitised.Should().NotContain("sk-proj-abcdef");
		sanitised.Should().Contain("\"access_token\": \"[redacted]\"",
			"the field name must survive so the operator knows WHICH field leaked");
	}

	[Fact]
	public void ItShouldRedactJsonRefreshToken() {
		var raw = "Token refresh failed: \"refresh_token\": \"rt_verysecret123\"";
		var sanitised = LastErrorSanitiser.Sanitize(raw).Required();
		sanitised.Should().NotContain("rt_verysecret123");
		sanitised.Should().Contain("\"refresh_token\": \"[redacted]\"",
			"the field name must survive so the operator knows WHICH field leaked");
	}

	[Fact]
	public void ItShouldRedactJsonClientSecret() {
		var raw = "Client auth failed: \"client_secret\": \"cs_prod_xyz789\"";
		var sanitised = LastErrorSanitiser.Sanitize(raw).Required();
		sanitised.Should().NotContain("cs_prod_xyz789");
		sanitised.Should().Contain("\"client_secret\": \"[redacted]\"",
			"the field name must survive so the operator knows WHICH field leaked");
	}

	// Mastodon (#2186): what an instance, or a proxy in front of it, can echo back.
	[Theory]
	[InlineData("""{"error":"invalid_client","client_secret":"cs_mastodon_9f8e7d"}""", "cs_mastodon_9f8e7d")]
	[InlineData("""{"access_token":"tok-mastodon-abc123","token_type":"Bearer","scope":"read"}""", "tok-mastodon-abc123")]
	[InlineData("""{"error":"invalid_grant","code_verifier":"verifier-secret-xyz"}""", "verifier-secret-xyz")]
	[InlineData("""{"token":"revoke-token-777"}""", "revoke-token-777")]
	[InlineData("publishing failed: 401 upstream said client_secret=cs_form_5544&client_id=public", "cs_form_5544")]
	[InlineData("exchange failed: code_verifier=verifier_form_8899 was rejected", "verifier_form_8899")]
	[InlineData("publishing failed: 502 Authorization: Bearer mastodon.access.token-42 not accepted", "mastodon.access.token-42")]
	public void ItShouldRedactTheSecretsAMastodonErrorBodyCanEcho(string raw, string secret) {
		var sanitised = LastErrorSanitiser.Sanitize(raw).Required();

		sanitised.Should().NotContain(secret);
		sanitised.Should().Contain("[redacted]");
	}

	[Theory]
	[InlineData("proxy echoed client_secret=\"cs_mastodon_9f8e7d\"", "cs_mastodon_9f8e7d")]
	[InlineData("proxy echoed client_secret='cs_mastodon_9f8e7d'", "cs_mastodon_9f8e7d")]
	[InlineData("body client_secret=cs%2Fabc123&x=1", "abc123")]
	[InlineData("body access_token=tok%2Bplus%3Dtail end", "tail")]
	public void ItShouldRedactQuotedAndUrlEncodedFormValues(string raw, string secret) {
		var sanitised = LastErrorSanitiser.Sanitize(raw).Required();

		sanitised.Should().NotContain(secret);
		sanitised.Should().Contain("[redacted]");
	}

	[Fact]
	public void ItShouldKeepTheReadableReasonOfAMastodonErrorBody() {
		var raw = "publishing failed: 422 Validation failed: Text character limit of 500 exceeded";

		LastErrorSanitiser.Sanitize(raw).Should().Be(raw);
	}

	[Fact]
	public void ItShouldLeaveCleanMessagesUntouched() {
		var raw = "Bluesky API returned 401 Unauthorized";
		LastErrorSanitiser.Sanitize(raw).Should().Be(raw);
	}
}
