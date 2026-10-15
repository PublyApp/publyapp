using PublyApp.Api.Modules.SocialAccounts.Entities;

namespace PublyApp.Api.Modules.Publishing.Providers;

/// <summary>
/// Static per-provider content limits (issue #2169). Bluesky counts graphemes
/// (extended grapheme clusters) AND the AT Protocol caps the same text in UTF-8
/// bytes; both must hold. Deliberately a plain lookup: a later capability
/// registry (#2173) can replace <see cref="For"/> without touching callers.
/// </summary>
public sealed record ProviderLimits(
	int MaxTextGraphemes,
	int MaxTextBytes,
	int MaxImages,
	long MaxImageBytes,
	IReadOnlyList<string> AcceptedImageContentTypes
) {
	public static readonly ProviderLimits Bluesky = new(
		MaxTextGraphemes: 300,
		MaxTextBytes: 3000,
		// app.bsky.embed.images: at most four images, each blob at most
		// 1,000,000 bytes, static JPEG/PNG/WebP only (#2170).
		MaxImages: 4,
		MaxImageBytes: 1_000_000,
		AcceptedImageContentTypes: ["image/jpeg", "image/png", "image/webp"]
	);

	/// <summary>
	/// The most images any provider accepts on one post: the attach-time cap, so
	/// a post never holds more than some destination could carry.
	/// </summary>
	public static readonly int MaxImagesPerPost = ProviderLimits.Bluesky.MaxImages;

	public static ProviderLimits For(SocialProvider provider) {
		if (provider == SocialProvider.Bluesky) {
			return ProviderLimits.Bluesky;
		}

		throw new ArgumentOutOfRangeException(
			nameof(provider), provider, "Unhandled SocialProvider"
		);
	}
}
