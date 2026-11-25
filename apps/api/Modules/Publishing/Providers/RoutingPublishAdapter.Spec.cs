using FluentAssertions;

using PublyApp.Api.Modules.SocialAccounts.Adapters;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Providers;

/// <summary>
/// #2511 review (medium): the registered <see cref="IPublishProvider"/> is now
/// <see cref="RoutingPublishAdapter"/>. Its whole job is to pick the adapter the registry
/// holds for the request's network, so these cases drive both operations through the public
/// methods and assert the network the registry was asked for AND the exact adapter called —
/// a rename that broke DI or argument forwarding fails here.
/// </summary>
public sealed class RoutingPublishAdapterSpec {
	[Fact]
	public async Task ItShouldPublishThroughTheAdapterRegisteredForTheRequestNetwork() {
		var registry = new RecordingRegistry();
		var adapter = new RoutingPublishAdapter(registry);
		var request = RoutingPublishAdapterSpec._PublishRequest(SocialProvider.Mastodon);

		var result = await adapter.PublishAsync(request, CancellationToken.None);

		registry.RequestedNetworks.Should().Equal(SocialProvider.Mastodon);
		registry.Recording.PublishRequests.Should().ContainSingle().Which.Should().BeSameAs(request);
		result.Should().BeOfType<PublishResult.Published>()
			.Which.RecordId.Should().Be("mastodon-record");
	}

	[Fact]
	public async Task ItShouldReconcileThroughTheAdapterRegisteredForTheRequestNetwork() {
		var registry = new RecordingRegistry();
		var adapter = new RoutingPublishAdapter(registry);
		var request = RoutingPublishAdapterSpec._ReconcileRequest(SocialProvider.Pixelfed);

		var result = await adapter.ReconcileAsync(request, CancellationToken.None);

		registry.RequestedNetworks.Should().Equal(SocialProvider.Pixelfed);
		registry.Recording.ReconcileRequests.Should().ContainSingle().Which.Should().BeSameAs(request);
		result.Should().BeOfType<ReconcileResult.SafeToResend>();
	}

	[Fact]
	public async Task ItShouldSurfaceTheRegistryRefusalForAnUnservedNetwork() {
		var adapter = new RoutingPublishAdapter(new RecordingRegistry());

		var act = () => adapter.PublishAsync(
			RoutingPublishAdapterSpec._PublishRequest(SocialProvider.DiscordWebhook),
			CancellationToken.None
		);

		var refusal = (await act.Should().ThrowAsync<UnsupportedNetworkException>()).Which;
		refusal.Network.Should().Be(SocialProvider.DiscordWebhook);
		refusal.Role.Should().Be("publisher");
	}

	private static PublishRequest _PublishRequest(SocialProvider provider) {
		return new PublishRequest {
			PublicationId = Guid.NewGuid(),
			IdempotencyKey = "routing-adapter-key",
			PostBody = "hello",
			ScheduledAtUtc = DateTime.UtcNow,
			Session = new SocialSession("did:plc:routing", "@routing.example", "jwt", "https://pds.test"),
			Provider = provider,
		};
	}

	private static ReconcileRequest _ReconcileRequest(SocialProvider provider) {
		return new ReconcileRequest {
			PublicationId = Guid.NewGuid(),
			IdempotencyKey = "routing-adapter-key",
			SegmentPosition = 0,
			Session = new SocialSession("did:plc:routing", "@routing.example", "jwt", "https://pds.test"),
			Provider = provider,
			FirstAttemptAtUtc = DateTime.UtcNow,
		};
	}

	private sealed class RecordingRegistry : ISocialAdapterRegistry {
		public RecordingPublisher Recording { get; } = new();

		public List<SocialProvider> RequestedNetworks { get; } = [];

		public ISocialPublisher Publisher(SocialProvider network) {
			if (network is not (SocialProvider.Mastodon or SocialProvider.Pixelfed)) {
				throw new UnsupportedNetworkException(network, "publisher");
			}

			this.RequestedNetworks.Add(network);
			return this.Recording;
		}
	}

	private sealed class RecordingPublisher : ISocialPublisher {
		public IReadOnlySet<SocialProvider> Networks { get; } =
			new HashSet<SocialProvider> { SocialProvider.Mastodon, SocialProvider.Pixelfed };

		public List<PublishRequest> PublishRequests { get; } = [];

		public List<ReconcileRequest> ReconcileRequests { get; } = [];

		public Task<PublishResult> PublishAsync(
			PublishRequest request,
			CancellationToken cancellationToken
		) {
			this.PublishRequests.Add(request);
			return Task.FromResult<PublishResult>(
				new PublishResult.Published("mastodon-record", "https://m.example/@routing/1")
			);
		}

		public Task<ReconcileResult> ReconcileAsync(
			ReconcileRequest request,
			CancellationToken cancellationToken
		) {
			this.ReconcileRequests.Add(request);
			return Task.FromResult<ReconcileResult>(new ReconcileResult.SafeToResend());
		}
	}
}
