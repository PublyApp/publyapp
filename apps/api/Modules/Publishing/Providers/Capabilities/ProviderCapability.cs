using PublyApp.Api.Modules.SocialAccounts.Entities;

namespace PublyApp.Api.Modules.Publishing.Providers.Capabilities;

/// <summary>
/// What one provider (or one account of it, once overrides are applied) accepts
/// on a post (issue #2173). Pure data plus counting rules: validation and the
/// composer read this and nothing else.
/// </summary>
public sealed record ProviderCapability(
	SocialProvider Provider,
	IReadOnlyList<TextLimit> TextLimits,
	int MaxImages,
	long MaxImageBytes,
	IReadOnlyList<string> AcceptedImageContentTypes,
	// False for an image-led provider: an empty body (or segment) is then allowed.
	bool RequiresText = true
);

/// <summary>
/// Per-account values that beat the provider defaults (a Mastodon instance's
/// advertised limits, cached on the account at connect time). Every member is
/// optional; <see cref="TextLimits"/> is keyed by counting-rule unit.
/// </summary>
public sealed record CapabilityOverrides(
	Dictionary<string, int>? TextLimits = null,
	int? MaxImages = null,
	long? MaxImageBytes = null,
	List<string>? AcceptedImageContentTypes = null
);
