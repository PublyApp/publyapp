using PublyApp.Api.Modules.Publishing.Lib;
using PublyApp.Api.Modules.Publishing.Providers.Capabilities;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.Publishing.Services;

/// <summary>Why a body cannot be published (issue #2169).</summary>
public enum PublishContentFailureKind {
	Empty,
	TooLong,
	TooManyImages,
	UnsupportedImageType,
	// The destination refuses an image without alt text and one has none (#2184).
	AltTextRequired,
	// A photo network (Pixelfed) was selected and the post has no image (#2175).
	MediaRequired,
	// A thread was aimed at a destination that cannot publish follow-ups (#2175).
	ThreadsUnsupported,
}

/// <summary>
/// One refusal: <see cref="Provider"/> is the wire provider name, <see cref="Unit"/>
/// is "graphemes" or "bytes". <see cref="Limit"/>/<see cref="Actual"/> are 0 for
/// <see cref="PublishContentFailureKind.Empty"/>. For the image kinds, Unit is
/// "images", Limit/Actual are the allowed/actual counts, and
/// <see cref="ImageIndex"/> (1-based) plus <see cref="ContentType"/> name the
/// offending image of an unsupported type (#2170). <see cref="SegmentNumber"/> is
/// the 1-based thread segment at fault (0 when the post is not a thread, #2171).
/// </summary>
public sealed record PublishContentFailure(
	PublishContentFailureKind Kind,
	string Provider,
	string Unit,
	int Limit,
	int Actual,
	int ImageIndex = 0,
	string? ContentType = null,
	int SegmentNumber = 0,
	// The destination (account handle and id) the failure is about, once the content was
	// resolved per destination (#2172); null on provider-level callers.
	string? Destination = null,
	Guid? SocialAccountId = null,
	// The content types the destination accepts, for an UnsupportedImageType cause (#2184).
	IReadOnlyList<string>? AcceptedImageContentTypes = null
) {
	public string Cause {
		get {
			var cause = this._BaseCause;
			cause = this.SegmentNumber > 0 ? $"Segment {this.SegmentNumber}: {cause}" : cause;
			return this.Destination is null ? cause : $"{this.Destination}: {cause}";
		}
	}

	// "image/jpeg", "image/png" -> "a JPEG or PNG image": derived from the capability, never
	// from a provider's own list.
	private static string _DescribeTypes(IReadOnlyList<string>? contentTypes) {
		var names = (contentTypes ?? [])
			.Select(PublishContentFailure._ImageTypeName)
			.Distinct()
			.ToList();
		return names.Count switch {
			0 => "a supported image type",
			1 => $"a {names[0]} image",
			_ => $"a {string.Join(", ", names.Take(names.Count - 1))} or {names[^1]} image",
		};
	}

	private static readonly Dictionary<string, string> _ImageTypeNames = new(StringComparer.OrdinalIgnoreCase) {
		["jpeg"] = "JPEG",
		["png"] = "PNG",
		["webp"] = "WebP",
		["gif"] = "GIF",
		["avif"] = "AVIF",
	};

	private static string _ImageTypeName(string contentType) {
		var subtype = contentType.Split('/').Last();
		return PublishContentFailure._ImageTypeNames.TryGetValue(subtype, out var name)
			? name
			: subtype.ToUpperInvariant();
	}

	private string _BaseCause {
		get {
			if (this.Kind == PublishContentFailureKind.Empty && this.SegmentNumber > 0) {
				return "The segment is empty. Write some text or remove it.";
			}

			if (this.Kind == PublishContentFailureKind.Empty) {
				return "The post text is empty. Write some text or attach media "
					+ "before publishing.";
			}

			if (this.Kind == PublishContentFailureKind.MediaRequired) {
				return $"{this.Provider} posts need at least one image. Attach an image "
					+ "or deselect it.";
			}

			if (this.Kind == PublishContentFailureKind.ThreadsUnsupported) {
				return $"{this.Provider} cannot publish a thread. Remove the extra "
					+ "segments or deselect it.";
			}

			if (this.Kind == PublishContentFailureKind.TooManyImages) {
				return $"The post has too many images for {this.Provider}: "
					+ $"{this.Actual} images, the limit is {this.Limit}.";
			}

			if (this.Kind == PublishContentFailureKind.UnsupportedImageType) {
				return $"Image {this.ImageIndex} ({this.ContentType}) is not a type "
					+ $"{this.Provider} accepts. Use {PublishContentFailure._DescribeTypes(this.AcceptedImageContentTypes)}.";
			}

			if (this.Kind == PublishContentFailureKind.AltTextRequired) {
				return $"{this.Provider} needs a description (alt text) on every image: "
					+ $"image {this.ImageIndex} has none.";
			}

			return $"The post text is too long for {this.Provider}: {this.Actual} "
				+ $"{this.Unit}, the limit is {this.Limit}.";
		}
	}
}

/// <summary>
/// Pure publish-time content validation shared by publish-now, schedule,
/// edit-schedule and the dispatch job. Static on purpose: domain services never
/// inject domain services, and there is nothing to look up (the post text and the
/// target providers are passed in). Drafts are never validated here.
/// </summary>
public static class PublishValidationService {
	public const string ImageUnit = "images";

	/// <summary>
	/// Validates the EFFECTIVE content of one destination against that account's
	/// capability and names the destination on any refusal (#2172).
	/// </summary>
	public static PublishContentFailure? ValidateDestination(
		EffectiveContent content,
		SocialAccount account
	) {
		var failure = PublishValidationService.Validate(
			content.Body,
			content.ImageContentTypes,
			[ProviderCapabilityRegistry.Resolve(account)],
			content.FollowUps,
			content.ImageAltTexts
		);
		return failure is null
			? null
			: failure with {
				Destination = account.DisplayHandle,
				SocialAccountId = account.GetRequiredId(),
			};
	}

	public static PublishContentFailure? Validate(
		string body,
		IReadOnlyList<string> imageContentTypes,
		IEnumerable<ProviderCapability> capabilities,
		IReadOnlyList<string>? followUpBodies = null,
		IReadOnlyList<string?>? imageAltTexts = null
	) {
		var normalized = TextCounter.Normalize(body);
		IReadOnlyList<string> followUps = followUpBodies ?? [];
		var providerList = capabilities.Distinct().ToList();
		if (providerList.Count == 0) {
			return null;
		}

		var textRequired = providerList.FirstOrDefault(limits => limits.RequiresText);
		if (textRequired is not null && normalized.Length == 0 && imageContentTypes.Count == 0) {
			return new PublishContentFailure(
				PublishContentFailureKind.Empty,
				SocialAccountWire.FormatProvider(textRequired.Provider),
				PublishValidationService._EmptyUnit(textRequired),
				0,
				0
			);
		}

		foreach (var limits in providerList) {
			var name = SocialAccountWire.FormatProvider(limits.Provider);

			if (limits.RequiresMedia && imageContentTypes.Count == 0) {
				return new PublishContentFailure(
					PublishContentFailureKind.MediaRequired,
					name,
					PublishValidationService.ImageUnit,
					1,
					0
				);
			}

			if (followUps.Count > 0 && !limits.SupportsThreads) {
				return new PublishContentFailure(
					PublishContentFailureKind.ThreadsUnsupported,
					name,
					"segments",
					1,
					followUps.Count + 1
				);
			}

			if (imageContentTypes.Count > limits.MaxImages) {
				return new PublishContentFailure(
					PublishContentFailureKind.TooManyImages,
					name,
					PublishValidationService.ImageUnit,
					limits.MaxImages,
					imageContentTypes.Count
				);
			}

			for (var index = 0; index < imageContentTypes.Count; index++) {
				if (!limits.AcceptedImageContentTypes.Contains(imageContentTypes[index])) {
					return new PublishContentFailure(
						PublishContentFailureKind.UnsupportedImageType,
						name,
						PublishValidationService.ImageUnit,
						limits.AcceptedImageContentTypes.Count,
						imageContentTypes.Count,
						index + 1,
						imageContentTypes[index],
						AcceptedImageContentTypes: limits.AcceptedImageContentTypes
					);
				}
			}

			if (limits.RequiresAltText && imageAltTexts is not null) {
				for (var index = 0; index < imageAltTexts.Count; index++) {
					if (string.IsNullOrWhiteSpace(imageAltTexts[index])) {
						return new PublishContentFailure(
							PublishContentFailureKind.AltTextRequired,
							name,
							PublishValidationService.ImageUnit,
							0,
							imageAltTexts.Count,
							index + 1
						);
					}
				}
			}

			var isThread = followUps.Count > 0;
			var textFailure = PublishValidationService._ValidateText(
				normalized, limits, name, isThread ? 1 : 0
			);
			if (textFailure is not null) {
				return textFailure;
			}

			// Every follow-up obeys the same per-segment limits (#2171).
			// The root is segment 1, so the first follow-up is segment 2.
			for (var number = 1 + 1; number <= followUps.Count + 1; number++) {
				var followUp = TextCounter.Normalize(followUps[number - 1 - 1]);
				if (followUp.Length == 0 && limits.RequiresText) {
					return new PublishContentFailure(
						PublishContentFailureKind.Empty,
						name,
						PublishValidationService._EmptyUnit(limits),
						0,
						0,
						SegmentNumber: number
					);
				}

				var followUpFailure = PublishValidationService._ValidateText(
					followUp, limits, name, number
				);
				if (followUpFailure is not null) {
					return followUpFailure;
				}
			}
		}

		return null;
	}

	// A provider with no text limit still names a unit on an Empty failure.
	private static string _EmptyUnit(ProviderCapability capability) {
		return capability.TextLimits.Count > 0
			? capability.TextLimits[0].Rule.Unit
			: GraphemeCountingRule.Instance.Unit;
	}

	private static PublishContentFailure? _ValidateText(
		string normalized,
		ProviderCapability limits,
		string providerName,
		int segmentNumber
	) {
		foreach (var limit in limits.TextLimits) {
			var actual = limit.Rule.Count(normalized);
			if (actual > limit.Max) {
				return new PublishContentFailure(
					PublishContentFailureKind.TooLong,
					providerName,
					limit.Rule.Unit,
					limit.Max,
					actual,
					SegmentNumber: segmentNumber
				);
			}
		}

		return null;
	}
}
