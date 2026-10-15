using System.Net;

using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Mastodon;

public sealed class MastodonHostGuardSpec {
	[Theory]
	[InlineData("mastodon.social", "mastodon.social")]
	[InlineData("  Mastodon.Social  ", "mastodon.social")]
	[InlineData("https://mastodon.social", "mastodon.social")]
	[InlineData("https://mastodon.social/@someone?x=1#top", "mastodon.social")]
	[InlineData("mastodon.social/", "mastodon.social")]
	[InlineData("social.example.co.uk.", "social.example.co.uk")]
	[InlineData("bücher.example", "xn--bcher-kva.example")]
	public void ItShouldNormalizeAPlainPublicHost(string input, string expected) {
		MastodonHostGuard.NormalizeHost(input).Should().Be(expected);
	}

	[Theory]
	[InlineData(null)]
	[InlineData("")]
	[InlineData("   ")]
	[InlineData("localhost")]
	[InlineData("foo.localhost")]
	[InlineData("printer.local")]
	[InlineData("db.internal")]
	[InlineData("http://mastodon.social")]
	[InlineData("mastodon.social:8443")]
	[InlineData("user@mastodon.social")]
	[InlineData("10.0.0.1")]
	[InlineData("127.0.0.1")]
	[InlineData("169.254.169.254")]
	[InlineData("192.168.1.1")]
	[InlineData("[::1]")]
	[InlineData("::1")]
	[InlineData("0x7f.0.0.1")]
	[InlineData("2130706433")]
	[InlineData("single-label")]
	[InlineData("exa mple.com")]
	[InlineData("-bad.example")]
	public void ItShouldRejectAnythingThatIsNotAPublicDnsName(string? input) {
		MastodonHostGuard.NormalizeHost(input).Should().BeNull();
	}

	[Theory]
	[InlineData("8.8.8.8", true)]
	[InlineData("93.184.216.34", true)]
	[InlineData("2606:4700:4700::1111", true)]
	[InlineData("127.0.0.1", false)]
	[InlineData("10.1.2.3", false)]
	[InlineData("172.16.0.1", false)]
	[InlineData("172.31.255.255", false)]
	[InlineData("172.32.0.1", true)]
	[InlineData("192.168.0.10", false)]
	[InlineData("169.254.169.254", false)]
	[InlineData("100.64.0.1", false)]
	[InlineData("0.0.0.0", false)]
	[InlineData("224.0.0.1", false)]
	[InlineData("255.255.255.255", false)]
	[InlineData("::1", false)]
	[InlineData("::", false)]
	[InlineData("fe80::1", false)]
	[InlineData("fc00::1", false)]
	[InlineData("fd12:3456::1", false)]
	[InlineData("ff02::1", false)]
	[InlineData("::ffff:10.0.0.1", false)]
	[InlineData("::ffff:8.8.8.8", true)]
	public void ItShouldOnlyAcceptGloballyRoutableAddresses(string address, bool expected) {
		MastodonHostGuard.IsPublicAddress(IPAddress.Parse(address)).Should().Be(expected);
	}

	[Theory]
	[InlineData("10.0.0.5")]
	[InlineData("127.0.0.1")]
	[InlineData("169.254.169.254")]
	public async Task ItShouldRefuseToConnectWhenANameResolvesToAPrivateAddress(string resolved) {
		// DNS rebinding / a public-looking name pointing inside: the connect callback
		// checks the ANSWER, so nothing is ever dialled.
		using var handler = MastodonHostGuard.CreateHandler((_, _) => Task.FromResult(new[] { IPAddress.Parse(resolved) }));
		using var client = new HttpClient(handler);

		var act = () => client.GetAsync("https://looks-public.example/");

		await act.Should().ThrowAsync<HttpRequestException>();
	}

	[Fact]
	public async Task ItShouldRefuseWhenAnyAnswerIsPrivateEvenIfAnotherIsPublic() {
		using var handler = MastodonHostGuard.CreateHandler(
			(_, _) => Task.FromResult(new[] { IPAddress.Parse("8.8.8.8"), IPAddress.Parse("10.0.0.5") })
		);
		using var client = new HttpClient(handler);

		var act = () => client.GetAsync("https://mixed.example/");

		await act.Should().ThrowAsync<HttpRequestException>();
	}

	[Fact]
	public void ItShouldNeverFollowARedirect() {
		using var handler = MastodonHostGuard.CreateHandler();

		handler.AllowAutoRedirect.Should().BeFalse("a redirect to a private address must not be reachable");
	}
}
