using PublyApp.Api.Modules.SocialAccounts.Entities;

namespace PublyApp.Api.Modules.SocialAccounts.Adapters;

/// <summary>No registered adapter serves the requested network for this role.</summary>
public sealed class UnsupportedNetworkException : Exception {
	public UnsupportedNetworkException(SocialProvider network, string role)
		: base($"No social {role} adapter is registered for network '{network}'.") {
		this.Network = network;
		this.Role = role;
	}

	public SocialProvider Network { get; }

	public string Role { get; }
}
