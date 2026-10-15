using System.Text.Json;

namespace PublyApp.Api.Modules.Publishing.Providers.Capabilities;

/// <summary>
/// Turns what a remote instance advertises into the overrides stored on an
/// account (#2174, review F3). Instance data is untrusted: a value that is not a
/// positive integer, or is absurdly large, is dropped (or clamped) so a broken
/// instance can never make every post fail or lift a limit without bound.
/// </summary>
public static class CapabilityOverridesFactory {
	public const int MaxTextLimit = 100_000;
	public const int MaxImagesLimit = 16;
	public const long MaxImageBytesLimit = 100L * 1024 * 1024;
	public const int MaxUrlLength = 1_000;

	private static readonly JsonSerializerOptions _Json = new(JsonSerializerDefaults.Web);

	/// <summary>
	/// The overrides JSON for a Mastodon instance, or null when nothing usable was
	/// advertised (the provider defaults then apply). Image types are intersected
	/// with the types the app can upload.
	/// </summary>
	public static string? ForMastodon(
		long? maxCharacters,
		long? maxMediaAttachments,
		long? urlLength,
		long? imageSizeLimit,
		IEnumerable<string>? supportedMimeTypes
	) {
		var overrides = new CapabilityOverrides(
			TextLimits: CapabilityOverridesFactory._Positive(maxCharacters, CapabilityOverridesFactory.MaxTextLimit) is { } characters
				? new Dictionary<string, int> { [MastodonCountingRule.Default.Unit] = characters }
				: null,
			MaxImages: CapabilityOverridesFactory._Positive(maxMediaAttachments, CapabilityOverridesFactory.MaxImagesLimit),
			MaxImageBytes: CapabilityOverridesFactory._PositiveLong(imageSizeLimit, CapabilityOverridesFactory.MaxImageBytesLimit),
			AcceptedImageContentTypes: CapabilityOverridesFactory._ImageTypes(supportedMimeTypes),
			UrlLength: CapabilityOverridesFactory._Positive(urlLength, CapabilityOverridesFactory.MaxUrlLength)
		);
		if (overrides.TextLimits is null && overrides.MaxImages is null
			&& overrides.MaxImageBytes is null && overrides.AcceptedImageContentTypes is null
			&& overrides.UrlLength is null) {
			return null;
		}

		return JsonSerializer.Serialize(overrides, CapabilityOverridesFactory._Json);
	}

	private static int? _Positive(long? value, int ceiling) {
		if (value is null or <= 0) {
			return null;
		}

		return (int)Math.Min(value.Value, ceiling);
	}

	private static long? _PositiveLong(long? value, long ceiling) {
		if (value is null or <= 0) {
			return null;
		}

		return Math.Min(value.Value, ceiling);
	}

	private static List<string>? _ImageTypes(IEnumerable<string>? advertised) {
		if (advertised is null) {
			return null;
		}

		var known = ProviderCapabilityRegistry.Mastodon.AcceptedImageContentTypes;
		var accepted = advertised
			.Select(type => type.Trim().ToLowerInvariant())
			.Where(type => known.Contains(type))
			.Distinct()
			.ToList();
		return accepted.Count == 0 ? null : accepted;
	}
}
