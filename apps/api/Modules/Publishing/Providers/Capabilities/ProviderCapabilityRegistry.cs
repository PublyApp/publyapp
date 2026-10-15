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

	private static readonly JsonSerializerOptions _Json = new(JsonSerializerDefaults.Web);

	private static readonly IReadOnlyDictionary<SocialProvider, ProviderCapability> _Defaults =
		new Dictionary<SocialProvider, ProviderCapability> {
			[SocialProvider.Bluesky] = ProviderCapabilityRegistry.Bluesky,
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
				.Select(limit => overrides.TextLimits is not null
					&& overrides.TextLimits.TryGetValue(limit.Rule.Unit, out var max)
						? limit with { Max = max }
						: limit)
				.ToList(),
			MaxImages = overrides.MaxImages ?? defaults.MaxImages,
			MaxImageBytes = overrides.MaxImageBytes ?? defaults.MaxImageBytes,
			AcceptedImageContentTypes =
				overrides.AcceptedImageContentTypes ?? defaults.AcceptedImageContentTypes,
		};
	}
}
