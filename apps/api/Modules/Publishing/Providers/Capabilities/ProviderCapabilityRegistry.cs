using System.Text.Json;

using PublyApp.Api.Modules.SocialAccounts.Entities;

namespace PublyApp.Api.Modules.Publishing.Providers.Capabilities;

/// <summary>
/// The one typed, code-defined source of provider limits (issue #2173). A new
/// provider adds one entry to the defaults table (plus its publish provider
/// and, if it counts text differently, one <see cref="ITextCountingRule"/>).
/// <see cref="Resolve"/> overlays the account's cached overrides on the defaults
/// and keeps using the last-known values until a reconnect replaces them.
/// </summary>
public static class ProviderCapabilityRegistry {
	public static readonly ProviderCapability Bluesky = new(
		SocialProvider.Bluesky,
		[new TextLimit(GraphemeCountingRule.Instance, 300), new TextLimit(ByteCountingRule.Instance, 3000)],
		// app.bsky.embed.images: at most four images, each blob at most
		// 1,000,000 bytes, static JPEG/PNG/WebP only (#2170).
		MaxImages: 4,
		MaxImageBytes: 1_000_000,
		AcceptedImageContentTypes: ["image/jpeg", "image/png", "image/webp"]
	);

	// Mastodon's stock instance values; an account's overrides replace them with
	// what its instance advertises (#2174). Images stay the static types the app
	// can upload.
	public static readonly ProviderCapability Mastodon = new(
		SocialProvider.Mastodon,
		[new TextLimit(MastodonCountingRule.Default, 500)],
		MaxImages: 4,
		MaxImageBytes: 16_777_216,
		AcceptedImageContentTypes: ["image/jpeg", "image/png", "image/webp"]
	);

	// Pixelfed (#2175): photo-first, so an image is required and a caption is not.
	// Stock values are the conservative fallback (4 images, 500 characters, JPEG/PNG)
	// when an instance advertises nothing; threads stay off (replies are comments).
	public static readonly ProviderCapability Pixelfed = new(
		SocialProvider.Pixelfed,
		[new TextLimit(Utf16CountingRule.Instance, 500)],
		MaxImages: 4,
		MaxImageBytes: 15_000_000,
		AcceptedImageContentTypes: ["image/jpeg", "image/png"],
		RequiresText: false,
		RequiresMedia: true,
		SupportsThreads: false
	);

	// Discord incoming webhook (#2175): 2000 characters, at most 10 attachments, a
	// conservative 8 MiB per file (the real cap depends on the server's tier).
	public static readonly ProviderCapability DiscordWebhook = new(
		SocialProvider.DiscordWebhook,
		[new TextLimit(Utf16CountingRule.Instance, 2000)],
		MaxImages: 10,
		MaxImageBytes: 8_388_608,
		AcceptedImageContentTypes: ["image/jpeg", "image/png", "image/webp"],
		SupportsThreads: false
	);

	private static readonly JsonSerializerOptions _Json = new(JsonSerializerDefaults.Web);

	private static readonly IReadOnlyDictionary<SocialProvider, ProviderCapability> _Defaults =
		new Dictionary<SocialProvider, ProviderCapability> {
			[SocialProvider.Bluesky] = ProviderCapabilityRegistry.Bluesky,
			[SocialProvider.Mastodon] = ProviderCapabilityRegistry.Mastodon,
			[SocialProvider.Pixelfed] = ProviderCapabilityRegistry.Pixelfed,
			[SocialProvider.DiscordWebhook] = ProviderCapabilityRegistry.DiscordWebhook,
		};

	/// <summary>
	/// The most images any provider accepts on one post: the attach-time cap, so
	/// a post never holds more than some destination could carry.
	/// </summary>
	public static int MaxImagesPerPost {
		get { return ProviderCapabilityRegistry._Defaults.Values.Max(capability => capability.MaxImages); }
	}

	/// <summary>The largest per-image size any provider accepts.</summary>
	public static long MaxImageBytes {
		get { return ProviderCapabilityRegistry._Defaults.Values.Max(capability => capability.MaxImageBytes); }
	}

	/// <summary>Every image type some provider accepts (attach-time filter).</summary>
	public static IReadOnlyList<string> AcceptedImageContentTypes {
		get {
			return ProviderCapabilityRegistry._Defaults.Values
				.SelectMany(capability => capability.AcceptedImageContentTypes)
				.Distinct()
				.ToList();
		}
	}

	public static ProviderCapability For(SocialProvider provider) {
		if (ProviderCapabilityRegistry._Defaults.TryGetValue(provider, out var capability)) {
			return capability;
		}

		throw new ArgumentOutOfRangeException(
			nameof(provider), provider, "Unhandled SocialProvider"
		);
	}

	/// <summary>
	/// The effective capability of one account: defaults overlaid with the last
	/// known overrides. <c>CapabilityRefreshedAt</c> is informational only, so a
	/// scheduled post is validated against the same limits at dispatch.
	/// </summary>
	public static ProviderCapability Resolve(SocialAccount account) {
		var defaults = ProviderCapabilityRegistry.For(account.Provider);
		if (string.IsNullOrWhiteSpace(account.CapabilityOverrides)) {
			return defaults;
		}

		CapabilityOverrides? overrides;
		try {
			overrides = JsonSerializer.Deserialize<CapabilityOverrides>(
				account.CapabilityOverrides,
				ProviderCapabilityRegistry._Json
			);
		} catch (JsonException) {
			return defaults;
		}

		if (overrides is null) {
			return defaults;
		}

		return defaults with {
			TextLimits = defaults.TextLimits
				.Select(limit => ProviderCapabilityRegistry._ApplyOverrides(limit, overrides))
				.ToList(),
			MaxImages = overrides.MaxImages ?? defaults.MaxImages,
			MaxImageBytes = overrides.MaxImageBytes ?? defaults.MaxImageBytes,
			AcceptedImageContentTypes =
				overrides.AcceptedImageContentTypes ?? defaults.AcceptedImageContentTypes,
		};
	}

	private static TextLimit _ApplyOverrides(TextLimit limit, CapabilityOverrides overrides) {
		var effective = limit;
		if (overrides.TextLimits is not null
			&& overrides.TextLimits.TryGetValue(limit.Rule.Unit, out var max)
			&& max > 0) {
			effective = effective with { Max = max };
		}

		if (effective.Rule is MastodonCountingRule && overrides.UrlLength is > 0) {
			effective = effective with { Rule = new MastodonCountingRule(overrides.UrlLength.Value) };
		}

		return effective;
	}
}
