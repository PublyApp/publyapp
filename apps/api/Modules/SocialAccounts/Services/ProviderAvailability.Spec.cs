using FluentAssertions;

using PublyApp.Api.Lib;
using PublyApp.Api.Modules.SocialAccounts.Entities;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Services;

public sealed class ProviderAvailabilitySpec {
	[Fact]
	public void ItShouldDisableOnlyTheProvidersListedByWireName() {
		string[] disabled = ["mastodon", "discord_webhook"];

		ProviderAvailability.IsEnabled(disabled, SocialProvider.Mastodon).Should().BeFalse();
		ProviderAvailability.IsEnabled(disabled, SocialProvider.DiscordWebhook).Should().BeFalse();
		ProviderAvailability.IsEnabled(disabled, SocialProvider.Bluesky).Should().BeTrue();
		ProviderAvailability.IsEnabled(disabled, SocialProvider.Pixelfed).Should().BeTrue();
		ProviderAvailability.IsEnabled([], SocialProvider.Mastodon).Should().BeTrue();
	}

	// The boot validator's rule: a typo must not silently leave a provider enabled.
	[Theory]
	[InlineData("bluesky", true)]
	[InlineData("mastodon", true)]
	[InlineData("pixelfed", true)]
	[InlineData("discord_webhook", true)]
	[InlineData("mastodom", false)]
	[InlineData("Mastodon", false)]
	[InlineData("discord", false)]
	[InlineData("", false)]
	public void ItShouldKnowExactlyTheProviderWireNames(string name, bool known) {
		ProviderAvailability.IsKnownWireName(name).Should().Be(known);
	}

	// The service reads whatever list its source yields, per call.
	[Fact]
	public void ItShouldAnswerFromTheListItsSourceYields() {
		IReadOnlyList<string> disabled = ["pixelfed"];
		var service = new ProviderAvailability(() => disabled);

		service.IsEnabled(SocialProvider.Pixelfed).Should().BeFalse();
		service.IsEnabled(SocialProvider.Mastodon).Should().BeTrue();
		disabled = ["mastodon"];
		service.IsEnabled(SocialProvider.Pixelfed).Should().BeTrue();
		service.IsEnabled(SocialProvider.Mastodon).Should().BeFalse();
	}

	// The public constructor wires the operator list AppEnvironment parsed.
	[Fact]
	public void ItShouldDefaultToTheListOfTheEnvironmentSettings() {
		var configured = AppEnvironment.Initialize().DISABLED_PUBLISH_PROVIDERS;
		var service = new ProviderAvailability();

		Enum.GetValues<SocialProvider>()
			.Where(service.IsEnabled)
			.Should().BeEquivalentTo(Enum.GetValues<SocialProvider>()
				.Where(provider => ProviderAvailability.IsEnabled(configured, provider)));
	}
}
