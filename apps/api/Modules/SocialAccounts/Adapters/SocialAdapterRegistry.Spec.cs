using System.Collections.Frozen;

using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Modules.Publishing.Providers;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Providers.Mastodon;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Adapters;

public sealed class SocialAdapterRegistrySpec {
	[Fact]
	public void ItShouldMapPixelfedToTheMastodonAdapter() {
		var mastodon = new StubPublisher(SocialProvider.Mastodon, SocialProvider.Pixelfed);
		var registry = new SocialAdapterRegistry([mastodon]);

		registry.Publisher(SocialProvider.Pixelfed).Should().BeSameAs(mastodon);
	}

	[Fact]
	public void ItShouldRejectANetworkNoAdapterPublishes() {
		var registry = new SocialAdapterRegistry([new StubPublisher(SocialProvider.Mastodon)]);

		var act = () => registry.Publisher(SocialProvider.Bluesky);

		act.Should().Throw<UnsupportedNetworkException>()
			.Which.Network.Should().Be(SocialProvider.Bluesky);
	}

	[Fact]
	public void ItShouldThrowWhenTwoPublishersClaimTheSameNetwork() {
		var first = new StubPublisher(SocialProvider.Mastodon);
		var second = new StubPublisher(SocialProvider.Mastodon);

		var act = () => new SocialAdapterRegistry([first, second]);

		act.Should().Throw<ArgumentException>();
	}

	[Fact]
	public void ItShouldFailAtStartupWhenTwoRegisteredAdaptersClaimTheSameNetwork() {
		var services = new ServiceCollection();
		services.AddSocialAdapter<DuplicatePublisherA>();
		services.AddSocialAdapter<DuplicatePublisherB>();
		services.AddSingleton<ISocialAdapterRegistry, SocialAdapterRegistry>();
		using var provider = services.BuildServiceProvider();

		var act = () => provider.GetRequiredService<ISocialAdapterRegistry>();

		act.Should().Throw<ArgumentException>();
	}

	[Fact]
	public void ItShouldResolveTheAdapterThroughItsPublisherPort() {
		var services = new ServiceCollection();
		services.AddSingleton<IHttpClientFactory>(new StubHttpClientFactory());
		services.AddSocialAdapter<MastodonSocialAdapter>();
		using var provider = services.BuildServiceProvider();

		var publisher = provider.GetRequiredService<ISocialPublisher>();

		publisher.Should().BeOfType<MastodonSocialAdapter>();
		provider.GetRequiredService<IMastodonClient>().Should().BeSameAs(publisher);
	}

	private class StubPublisher(params SocialProvider[] networks) : ISocialPublisher {
		public IReadOnlySet<SocialProvider> Networks { get; } = networks.ToFrozenSet();

		public Task<PublishResult> PublishAsync(
			PublishRequest request,
			CancellationToken cancellationToken
		) {
			return Task.FromResult<PublishResult>(new PublishResult.Published("id", "url"));
		}

		public Task<ReconcileResult> ReconcileAsync(
			ReconcileRequest request,
			CancellationToken cancellationToken
		) {
			return Task.FromResult<ReconcileResult>(new ReconcileResult.NeedsReview("stub"));
		}
	}

	private sealed class DuplicatePublisherA : StubPublisher {
		public DuplicatePublisherA()
			: base(SocialProvider.Mastodon) {
		}
	}

	private sealed class DuplicatePublisherB : StubPublisher {
		public DuplicatePublisherB()
			: base(SocialProvider.Mastodon) {
		}
	}

	private sealed class StubHttpClientFactory : IHttpClientFactory {
		public HttpClient CreateClient(string name) {
			return new HttpClient();
		}
	}
}
