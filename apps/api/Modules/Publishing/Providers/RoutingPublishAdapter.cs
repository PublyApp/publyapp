using PublyApp.Api.Modules.SocialAccounts.Adapters;

namespace PublyApp.Api.Modules.Publishing.Providers;

/// <summary>
/// The registered <see cref="IPublishProvider"/>: picks the one adapter the registry
/// holds for the request's network (#2509), so no network name is hard-coded here.
/// </summary>
public sealed class RoutingPublishAdapter : IPublishProvider {
	private readonly ISocialAdapterRegistry _Adapters;

	public RoutingPublishAdapter(ISocialAdapterRegistry adapters) {
		this._Adapters = adapters;
	}

	public Task<ReconcileResult> ReconcileAsync(
		ReconcileRequest request,
		CancellationToken cancellationToken
	) {
		return this._Adapters.Publisher(request.Provider).ReconcileAsync(request, cancellationToken);
	}

	public Task<PublishResult> PublishAsync(PublishRequest request, CancellationToken cancellationToken) {
		return this._Adapters.Publisher(request.Provider).PublishAsync(request, cancellationToken);
	}
}
