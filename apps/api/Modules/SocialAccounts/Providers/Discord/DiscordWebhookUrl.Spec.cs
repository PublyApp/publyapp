using FluentAssertions;

using Microsoft.AspNetCore.DataProtection;

using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Discord;

// The pasted URL carries a secret token and decides which host the server calls:
// only the exact Discord shapes may pass, and the token may never be printed.
public sealed class DiscordWebhookUrlSpec {
	private const string _Id = "1234567890123456789";
	private const string _Token = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdEfGhIjKlMnOpQrStUvWxYz01";
	private static readonly string _Path = $"/api/webhooks/{DiscordWebhookUrlSpec._Id}/{DiscordWebhookUrlSpec._Token}";

	[Theory]
	[InlineData("discord.com")]
	[InlineData("discordapp.com")]
	[InlineData("ptb.discord.com")]
	[InlineData("canary.discord.com")]
	[InlineData("DISCORD.COM")]
	public void ItShouldAcceptTheDiscordHostsAndRebuildTheCanonicalUrl(string host) {
		var parsed = DiscordWebhookUrl.Parse($"  https://{host}{DiscordWebhookUrlSpec._Path}  ");

		Assert.NotNull(parsed);
		parsed.Id.Should().Be(DiscordWebhookUrlSpec._Id);
		parsed.Full.Should().Be($"https://{host.ToLowerInvariant()}{DiscordWebhookUrlSpec._Path}");
	}

	[Fact]
	public void ItShouldDropAnApiVersionSegment() {
		var parsed = DiscordWebhookUrl.Parse(
			$"https://discord.com/api/v10/webhooks/{DiscordWebhookUrlSpec._Id}/{DiscordWebhookUrlSpec._Token}"
		);

		Assert.NotNull(parsed);
		parsed.Full.Should().Be($"https://discord.com{DiscordWebhookUrlSpec._Path}");
	}

	[Theory]
	[InlineData("")]
	[InlineData("   ")]
	[InlineData("not a url")]
	[InlineData("http://discord.com/api/webhooks/1234567890123456789/TOKEN")]
	[InlineData("https://discord.com.evil.example/api/webhooks/ID/TOKEN")]
	[InlineData("https://evil.example/https://discord.com/api/webhooks/ID/TOKEN")]
	[InlineData("https://discord.com@evil.example/api/webhooks/ID/TOKEN")]
	[InlineData("https://user:pass@discord.com/api/webhooks/ID/TOKEN")]
	[InlineData("https://discord.com:8443/api/webhooks/ID/TOKEN")]
	[InlineData("https://localhost/api/webhooks/ID/TOKEN")]
	[InlineData("https://127.0.0.1/api/webhooks/ID/TOKEN")]
	[InlineData("https://169.254.169.254/api/webhooks/ID/TOKEN")]
	[InlineData("https://[::1]/api/webhooks/ID/TOKEN")]
	[InlineData("https://discord.com./api/webhooks/ID/TOKEN")]
	[InlineData("https://notdiscord.com/api/webhooks/ID/TOKEN")]
	[InlineData("https://cdn.discord.com/api/webhooks/ID/TOKEN")]
	[InlineData("ftp://discord.com/api/webhooks/ID/TOKEN")]
	public void ItShouldRejectEveryOtherHostSchemeOrShape(string input) {
		DiscordWebhookUrl.Parse(
			input.Replace("ID", DiscordWebhookUrlSpec._Id).Replace("TOKEN", DiscordWebhookUrlSpec._Token)
		).Should().BeNull();
	}

	[Theory]
	[InlineData("/api/webhooks/12345/TOKEN")]
	[InlineData("/api/webhooks/ID")]
	[InlineData("/api/webhooks/ID/TOKEN/")]
	[InlineData("/api/webhooks/ID/TOKEN/github")]
	[InlineData("/api/webhooks/ID/TOKEN?wait=true")]
	[InlineData("/api/webhooks/ID/TOKEN#frag")]
	[InlineData("/api/webhooks/ID/TO%4BEN")]
	[InlineData("/api/webhooks/ID/TOKEN%2F..%2Fx")]
	[InlineData("/api/webhooks/ID/..%5Cx")]
	[InlineData("/api/channels/ID/TOKEN")]
	[InlineData("/api/webhooks/ID/short")]
	[InlineData("/api/webhooks/abc/TOKEN")]
	[InlineData("//api/webhooks/ID/TOKEN")]
	public void ItShouldRejectAWrongPathQueryFragmentOrEscape(string path) {
		DiscordWebhookUrl.Parse(
			"https://discord.com" + path.Replace("ID", DiscordWebhookUrlSpec._Id).Replace("TOKEN", DiscordWebhookUrlSpec._Token)
		).Should().BeNull();
	}

	[Fact]
	public void ItShouldMaskTheTokenInEveryPrintedForm() {
		var parsed = DiscordWebhookUrl.Parse($"https://discord.com{DiscordWebhookUrlSpec._Path}");

		Assert.NotNull(parsed);
		parsed.Masked.Should().Be($"https://discord.com/api/webhooks/{DiscordWebhookUrlSpec._Id}/AbCd…");
		parsed.ToString().Should().NotContain(DiscordWebhookUrlSpec._Token);
		$"{parsed}".Should().NotContain(DiscordWebhookUrlSpec._Token);
		new DiscordWebhookCredentials(parsed.Full, "42").ToString().Should().NotContain(DiscordWebhookUrlSpec._Token);
	}
}

public sealed class DiscordWebhookCredentialsSpec {
	private static readonly CredentialProtector _Protector =
		new(DataProtectionProvider.Create("discord-webhook-spec"));

	[Fact]
	public void ItShouldEncryptTheUrlUnderTheDiscordPurposeOnly() {
		var url = $"https://discord.com/api/webhooks/1234567890123456789/{new string('a', 68)}";

		var sealedText = new DiscordWebhookCredentials(url, "42").Protect(DiscordWebhookCredentialsSpec._Protector);

		sealedText.Should().NotContain("webhooks").And.NotContain(new string('a', 68));
		DiscordWebhookCredentials.Unprotect(DiscordWebhookCredentialsSpec._Protector, sealedText)
			.Should().Be(new DiscordWebhookCredentials(url, "42"));
		DiscordWebhookCredentialsSpec._Protector.Unprotect(sealedText, SocialProvider.Mastodon).Outcome
			.Should().Be(UnprotectOutcome.Tampered);
	}

	[Fact]
	public void ItShouldRefuseAStoredValueThatIsNoLongerAWebhookUrl() {
		var sealedText = new DiscordWebhookCredentials("https://evil.example/x", null)
			.Protect(DiscordWebhookCredentialsSpec._Protector);

		DiscordWebhookCredentials.Unprotect(DiscordWebhookCredentialsSpec._Protector, sealedText).Should().BeNull();
	}
}
