using System.Text.Json;

using FluentAssertions;

using PublyApp.Api.Modules.SocialAccounts.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Providers.Capabilities;

public sealed class CapabilityOverridesFactorySpec {
	private static readonly JsonSerializerOptions _Web = new(JsonSerializerDefaults.Web);

	private static SocialAccount _Account(string? overrides) {
		return new SocialAccount {
			TenantId = Guid.NewGuid(),
			Provider = SocialProvider.Mastodon,
			ExternalAccountId = "1@social.example",
			DisplayHandle = "me@social.example",
			ProtectedCredentials = "x",
			CapabilityOverrides = overrides,
		};
	}

	[Fact]
	public void ItShouldDefaultAMastodonAccountToTheStockInstanceLimitsInTheCharactersUnit() {
		var capability = ProviderCapabilityRegistry.Resolve(CapabilityOverridesFactorySpec._Account(null));

		capability.TextLimits.Should().ContainSingle()
			.Which.Should().Match<TextLimit>(limit => limit.Rule.Unit == "characters" && limit.Max == 500 && limit.Rule.UrlWeight == 23);
		capability.MaxImages.Should().Be(4);
	}

	[Fact]
	public void ItShouldLiftTheLimitsToWhatTheInstanceAdvertises() {
		var json = CapabilityOverridesFactory.ForMastodon(5000, 6, 30, 8_000_000, ["image/png", "IMAGE/JPEG", "image/gif"]);

		var capability = ProviderCapabilityRegistry.Resolve(CapabilityOverridesFactorySpec._Account(json));

		var limit = capability.TextLimits.Should().ContainSingle().Subject;
		limit.Max.Should().Be(5000);
		limit.Rule.UrlWeight.Should().Be(30);
		capability.MaxImages.Should().Be(6);
		capability.MaxImageBytes.Should().Be(8_000_000);
		capability.AcceptedImageContentTypes.Should().BeEquivalentTo(["image/png", "image/jpeg"]);
	}

	[Fact]
	public void ItShouldDropNonPositiveValuesAndKeepTheDefaults() {
		var json = CapabilityOverridesFactory.ForMastodon(0, -3, 0, 0, []);

		json.Should().BeNull("nothing usable was advertised");
	}

	[Fact]
	public void ItShouldClampAbsurdValues() {
		var json = CapabilityOverridesFactory.ForMastodon(long.MaxValue, 9_999, 1_000_000, long.MaxValue, null);

		var capability = ProviderCapabilityRegistry.Resolve(CapabilityOverridesFactorySpec._Account(json));

		capability.TextLimits.Single().Max.Should().Be(CapabilityOverridesFactory.MaxTextLimit);
		capability.MaxImages.Should().Be(CapabilityOverridesFactory.MaxImagesLimit);
		capability.MaxImageBytes.Should().Be(CapabilityOverridesFactory.MaxImageBytesLimit);
		capability.TextLimits.Single().Rule.UrlWeight.Should().Be(CapabilityOverridesFactory.MaxUrlLength);
	}

	[Fact]
	public void ItShouldIgnoreAnAdvertisedTypeListWithNothingTheAppCanUpload() {
		var json = CapabilityOverridesFactory.ForMastodon(null, null, null, null, ["image/heic", "video/mp4", "  "]);

		json.Should().BeNull();
	}

	[Fact]
	public void ItShouldIgnoreABrokenStoredLimitWhenResolving() {
		var broken = JsonSerializer.Serialize(new CapabilityOverrides(
			TextLimits: new Dictionary<string, int> { ["characters"] = 0 }, UrlLength: -1
		), CapabilityOverridesFactorySpec._Web);

		var capability = ProviderCapabilityRegistry.Resolve(CapabilityOverridesFactorySpec._Account(broken));

		capability.TextLimits.Single().Max.Should().Be(500);
		capability.TextLimits.Single().Rule.UrlWeight.Should().Be(23);
	}

	[Fact]
	public void ItShouldCountAMastodonUrlAsTheReservedLengthHoweverLongItIs() {
		var rule = new MastodonCountingRule(23);

		rule.Count("https://example.com/" + new string('a', 80)).Should().Be(23);
		rule.Count("@alice@mastodon.social hi").Should().Be("@alice hi".Length);
	}
}
