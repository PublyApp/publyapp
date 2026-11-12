using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.SocialAccounts.Entities;

namespace PublyApp.Api.Modules.SocialAccounts.Services;

/// <summary>
/// Whether the operator lets tenants connect a provider (issue #2184). Configuration
/// only (<c>DISABLED_PUBLISH_PROVIDERS</c>): accounts already connected keep working,
/// a disabled provider is hidden from the connect screen and refused by connect.
/// </summary>
public interface IProviderAvailability {
	bool IsEnabled(SocialProvider provider);
}

[Service(ServiceLifetime.Scoped)]
public sealed class ProviderAvailability : IProviderAvailability {
	public bool IsEnabled(SocialProvider provider) {
		return !AppEnvironment.Instance.DISABLED_PUBLISH_PROVIDERS
			.Contains(SocialAccountWire.FormatProvider(provider));
	}
}
