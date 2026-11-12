using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.SocialAccounts.Entities;

namespace PublyApp.Api.Modules.SocialAccounts.Services;

/// <summary>
/// Whether the operator lets a provider be used (issue #2184). Configuration only
/// (<c>DISABLED_PUBLISH_PROVIDERS</c>): a disabled provider cannot be connected or
/// reconnected, is not offered as a publish target, and its queued publications fail
/// with a clear cause until it is enabled again and the publication is retried.
/// </summary>
public interface IProviderAvailability {
	bool IsEnabled(SocialProvider provider);
}

[Service(ServiceLifetime.Scoped)]
public sealed class ProviderAvailability : IProviderAvailability {
	public bool IsEnabled(SocialProvider provider) {
		return ProviderAvailability.IsEnabled(AppEnvironment.Instance.DISABLED_PUBLISH_PROVIDERS, provider);
	}

	/// <summary>The pure rule: the provider's wire name is not in the operator's list.</summary>
	public static bool IsEnabled(IReadOnlyList<string> disabledWireNames, SocialProvider provider) {
		return !disabledWireNames.Contains(SocialAccountWire.FormatProvider(provider));
	}

	/// <summary>True when the name is a provider wire name (boot validation of the list).</summary>
	public static bool IsKnownWireName(string name) {
		return Enum.GetValues<SocialProvider>().Any(provider => SocialAccountWire.FormatProvider(provider) == name);
	}
}
