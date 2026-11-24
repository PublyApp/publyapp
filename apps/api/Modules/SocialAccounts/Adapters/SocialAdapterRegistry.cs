using PublyApp.Api.Modules.SocialAccounts.Entities;

namespace PublyApp.Api.Modules.SocialAccounts.Adapters;

/// <summary>
/// Dictionaries built once from <see cref="ISocialPublisher.Networks"/> and
/// <see cref="ISocialConnector.Networks"/>. A duplicate network throws in the
/// constructor (startup), never silently picking one adapter over another.
/// </summary>
public sealed class SocialAdapterRegistry : ISocialAdapterRegistry {
	private readonly IReadOnlyDictionary<SocialProvider, ISocialPublisher> _Publishers;
	private readonly IReadOnlyDictionary<SocialProvider, ISocialConnector> _Connectors;

	public SocialAdapterRegistry(
		IEnumerable<ISocialPublisher> publishers,
		IEnumerable<ISocialConnector> connectors
	) {
		this._Publishers = SocialAdapterRegistry._Index(publishers, publisher => publisher.Networks);
		this._Connectors = SocialAdapterRegistry._Index(connectors, connector => connector.Networks);
	}

	public ISocialPublisher Publisher(SocialProvider network) {
		return this._Publishers.TryGetValue(network, out var publisher)
			? publisher
			: throw new UnsupportedNetworkException(network, "publisher");
	}

	public ISocialConnector Connector(SocialProvider network) {
		return this._Connectors.TryGetValue(network, out var connector)
			? connector
			: throw new UnsupportedNetworkException(network, "connector");
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
