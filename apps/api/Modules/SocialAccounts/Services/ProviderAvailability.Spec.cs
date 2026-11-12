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

	// The service is the wiring: it applies the rule to the list AppEnvironment parsed from
	// DISABLED_PUBLISH_PROVIDERS, whatever the ambient value is.
	[Fact]
	public void ItShouldApplyTheRuleToTheListOfTheEnvironmentSettings() {
		var configured = AppEnvironment.Initialize().DISABLED_PUBLISH_PROVIDERS;
		var service = new ProviderAvailability();

		foreach (var provider in Enum.GetValues<SocialProvider>()) {
			service.IsEnabled(provider).Should().Be(ProviderAvailability.IsEnabled(configured, provider));
		}
	}
}
