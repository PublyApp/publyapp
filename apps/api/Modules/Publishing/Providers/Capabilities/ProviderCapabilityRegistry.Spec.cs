using FluentAssertions;

using PublyApp.Api.Modules.Publishing.Services;
using PublyApp.Api.Modules.SocialAccounts.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Providers.Capabilities;

public sealed class ProviderCapabilityRegistrySpec {
	private static readonly DateTime _Now = new(2026, 10, 15, 12, 0, 0, DateTimeKind.Utc);

	/// <summary>An invented rule: twice the length.</summary>
	private sealed class OddRule : ITextCountingRule {
		public string Unit {
			get { return "odd"; }
		}

		public int Count(string normalized) {
			return normalized.Length * 2;
		}
	}

	private static SocialAccount _Account(string? overrides, DateTime? refreshedAt) {
		return new SocialAccount {
			TenantId = Guid.NewGuid(),
			ExternalAccountId = "did:plc:x",
			DisplayHandle = "x.example",
			ProtectedCredentials = "x",
			CapabilityOverrides = overrides,
			CapabilityRefreshedAt = refreshedAt,
		};
	}

	[Fact]
	public void ItShouldHoldTheBlueskyDefaults() {
		var capability = ProviderCapabilityRegistry.For(SocialProvider.Bluesky);

		capability.TextLimits.Select(limit => (limit.Rule.Unit, limit.Max))
			.Should().Equal(("graphemes", 300), ("bytes", 3000));
		capability.MaxImages.Should().Be(4);
		capability.MaxImageBytes.Should().Be(1_000_000);
		capability.AcceptedImageContentTypes.Should()
			.Equal("image/jpeg", "image/png", "image/webp");
	}

	[Fact]
	public void ItShouldLetAFreshAccountOverrideBeatTheDefault() {
		var account = ProviderCapabilityRegistrySpec._Account(
			"""{"textLimits":{"graphemes":500},"maxImages":2}""", ProviderCapabilityRegistrySpec._Now.AddHours(-1)
		);

		var capability = ProviderCapabilityRegistry.Resolve(account, ProviderCapabilityRegistrySpec._Now);

		capability.TextLimits.Single(limit => limit.Rule.Unit == "graphemes").Max.Should().Be(500);
		capability.TextLimits.Single(limit => limit.Rule.Unit == "bytes").Max.Should().Be(3000);
		capability.MaxImages.Should().Be(2);
		capability.MaxImageBytes.Should().Be(1_000_000);
	}

	[Fact]
	public void ItShouldFallBackToDefaultsWhenTheOverrideIsStaleNeverRefreshedOrBroken() {
		var json = """{"maxImages":2}""";

		ProviderCapabilityRegistry.Resolve(ProviderCapabilityRegistrySpec._Account(json, ProviderCapabilityRegistrySpec._Now.AddDays(-2)), ProviderCapabilityRegistrySpec._Now)
			.Should().BeSameAs(ProviderCapabilityRegistry.Bluesky);
		ProviderCapabilityRegistry.Resolve(ProviderCapabilityRegistrySpec._Account(json, null), ProviderCapabilityRegistrySpec._Now)
			.Should().BeSameAs(ProviderCapabilityRegistry.Bluesky);
		ProviderCapabilityRegistry.Resolve(ProviderCapabilityRegistrySpec._Account("{not json", ProviderCapabilityRegistrySpec._Now), ProviderCapabilityRegistrySpec._Now)
			.Should().BeSameAs(ProviderCapabilityRegistry.Bluesky);
	}

	[Fact]
	public void ItShouldValidateAnyProviderWithoutNewValidationBranches() {
		var fake = new ProviderCapability(
			SocialProvider.Bluesky,
			[new TextLimit(new OddRule(), 10)],
			MaxImages: 1,
			MaxImageBytes: 5,
			AcceptedImageContentTypes: ["image/png"]
		);

		PublishValidationService.Validate("12345", [], [fake]).Should().BeNull();

		var tooLong = PublishValidationService.Validate("123456", [], [fake]);
		Assert.NotNull(tooLong);
		tooLong.Unit.Should().Be("odd");
		tooLong.Limit.Should().Be(10);
		tooLong.Actual.Should().Be(12);

		var tooMany = PublishValidationService.Validate("a", ["image/png", "image/png"], [fake]);
		Assert.NotNull(tooMany);
		tooMany.Kind.Should().Be(PublishContentFailureKind.TooManyImages);

		var badType = PublishValidationService.Validate("a", ["image/webp"], [fake]);
		Assert.NotNull(badType);
		badType.Kind.Should().Be(PublishContentFailureKind.UnsupportedImageType);
	}
}
