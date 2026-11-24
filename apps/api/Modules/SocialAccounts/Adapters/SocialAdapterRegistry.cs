using PublyApp.Api.Modules.SocialAccounts.Entities;

namespace PublyApp.Api.Modules.SocialAccounts.Adapters;

/// <summary>
/// Dictionary built once from <see cref="ISocialPublisher.Networks"/>. A duplicate
/// network throws in the constructor (startup), never silently picking one adapter
/// over another.
/// </summary>
public sealed class SocialAdapterRegistry : ISocialAdapterRegistry {
	private readonly IReadOnlyDictionary<SocialProvider, ISocialPublisher> _Publishers;

	public SocialAdapterRegistry(IEnumerable<ISocialPublisher> publishers) {
		this._Publishers = SocialAdapterRegistry._Index(publishers, publisher => publisher.Networks);
	}

	public ISocialPublisher Publisher(SocialProvider network) {
		return this._Publishers.TryGetValue(network, out var publisher)
			? publisher
			: throw new UnsupportedNetworkException(network, "publisher");
	}

	private static IReadOnlyDictionary<SocialProvider, TAdapter> _Index<TAdapter>(
		IEnumerable<TAdapter> adapters,
		Func<TAdapter, IReadOnlySet<SocialProvider>> networks
	) {
		return adapters
			.SelectMany(adapter => networks(adapter)
				.Select(network => (Network: network, Adapter: adapter)))
			.ToDictionary(pair => pair.Network, pair => pair.Adapter);
	}
}
