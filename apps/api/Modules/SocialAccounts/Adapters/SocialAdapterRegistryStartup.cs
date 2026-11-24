namespace PublyApp.Api.Modules.SocialAccounts.Adapters;

/// <summary>
/// Builds the adapter table during host startup, in every role, so a duplicate
/// network fails the BOOT instead of the first publish. A hosted service (rather
/// than a line in <c>Program.Main</c>) keeps the check on the real startup path,
/// including the web host factory the integration specs use.
/// </summary>
public sealed class SocialAdapterRegistryStartup : IHostedService {
	public SocialAdapterRegistryStartup(ISocialAdapterRegistry registry) {
		// Resolving the registry is the check: its constructor throws on a duplicate network.
		this.Registry = registry;
	}

	public ISocialAdapterRegistry Registry { get; }

	public Task StartAsync(CancellationToken cancellationToken) {
		return Task.CompletedTask;
	}

	public Task StopAsync(CancellationToken cancellationToken) {
		return Task.CompletedTask;
	}
}
