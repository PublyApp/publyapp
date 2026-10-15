using PublyApp.Api.Modules.SocialAccounts.Entities;

namespace PublyApp.Api.Modules.Publishing.Providers;

/// <summary>
/// Static per-provider content limits (issue #2169). Bluesky counts graphemes
/// (extended grapheme clusters) AND the AT Protocol caps the same text in UTF-8
/// bytes; both must hold. Deliberately a plain lookup: a later capability
/// registry (#2173) can replace <see cref="For"/> without touching callers.
/// </summary>
public sealed record ProviderLimits(int MaxTextGraphemes, int MaxTextBytes) {
	public static readonly ProviderLimits Bluesky = new(
		MaxTextGraphemes: 300,
		MaxTextBytes: 3000
	);

	public static ProviderLimits For(SocialProvider provider) {
		if (provider == SocialProvider.Bluesky) {
			return ProviderLimits.Bluesky;
		}

		throw new ArgumentOutOfRangeException(
			nameof(provider), provider, "Unhandled SocialProvider"
		);
	}
}
