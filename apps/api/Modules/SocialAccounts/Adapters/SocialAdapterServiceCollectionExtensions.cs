namespace PublyApp.Api.Modules.SocialAccounts.Adapters;

public static class SocialAdapterServiceCollectionExtensions {
	/// <summary>
	/// Registers one adapter as a singleton, then forwards every port it implements to
	/// that same instance, so resolving a publisher and a connector yields one object.
	/// </summary>
	public static IServiceCollection AddSocialAdapter<TAdapter>(this IServiceCollection services)
		where TAdapter : class {
		services.AddSingleton<TAdapter>();

		foreach (var port in typeof(TAdapter).GetInterfaces().Where(port =>
			port != typeof(IDisposable) && port != typeof(IAsyncDisposable))) {
			services.AddSingleton(port, provider => provider.GetRequiredService<TAdapter>());
		}

		return services;
	}
}
