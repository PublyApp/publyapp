using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

using Moq;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Providers.Bluesky;
using PublyApp.Api.Modules.SocialAccounts.Providers.Discord;
using PublyApp.Api.Modules.SocialAccounts.Services;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Mastodon;

/// <summary>
/// #2509 review minor 13: develop silently fell through to Bluesky for a provider it
/// did not recognise; the routing table now refuses it. The table covers the four known
/// networks, so an out-of-range value (corrupted row) is the only case that reaches the
/// branch, and it must be an AccountFailure that names the network.
/// </summary>
public sealed class RoutingSocialSessionProviderSpec {
	[Fact]
	public void ItShouldReturnAnAccountFailureForANetworkWithNoSessionProvider() {
		var network = (SocialProvider)99;
		var router = RoutingSocialSessionProviderSpec._Router();

		var cause = router.UnmappedCause(network);

		cause.Should().NotBeNull();
		cause.Should().Contain("no session provider is registered")
			.And.Contain(network.ToString());
	}

	[Fact]
	public void ItShouldHaveASessionProviderForEveryKnownNetwork() {
		var router = RoutingSocialSessionProviderSpec._Router();

		foreach (var network in Enum.GetValues<SocialProvider>()) {
			router.UnmappedCause(network).Should().BeNull();
		}
	}

	private static RoutingSocialSessionProvider _Router() {
		var db = new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql("Host=routing-table-stub;Database=stub")
				.Options
		);
		var protector = new Mock<ICredentialProtector>().Object;
		return new RoutingSocialSessionProvider(
			db,
			new BlueskySessionProvider(
				db,
				protector,
				new Mock<IBlueskyClient>().Object,
				NullLogger<BlueskySessionProvider>.Instance
			),
			new MastodonSessionProvider(db, protector),
			new DiscordWebhookSessionProvider(db, protector)
		);
	}
}
