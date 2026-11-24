using PublyApp.Api.Modules.SocialAccounts.Entities;

namespace PublyApp.Api.Modules.SocialAccounts.Adapters;

/// <summary>
/// Picks the single adapter that serves a network. Built once from the registered ports,
/// so a network claimed twice fails at startup instead of on the first publish.
/// </summary>
public interface ISocialAdapterRegistry {
	ISocialPublisher Publisher(SocialProvider network);
}
