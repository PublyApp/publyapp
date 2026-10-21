using System.Text.Json;
using System.Text.Json.Serialization;

using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Posts.Validation;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Services;

namespace PublyApp.Api.Modules.Publishing.Lib;

/// <summary>Ordered subset of the post's images plus per-image alt text (#2172).</summary>
/// <param name="AssetIds">Publish order; null keeps every image of the post in its order.</param>
/// <param name="AltTexts">Alt text by asset id; a blank value clears the alt text.</param>
public sealed record RenditionMediaOverride(
	IReadOnlyList<Guid>? AssetIds,
	IReadOnlyDictionary<Guid, string> AltTexts
);

/// <summary>Provider settings of one destination: stored only, nothing consumes them yet.</summary>
public sealed record RenditionSettings(string? Visibility) {
	public const int VisibilityMaxLength = 32;
}

/// <summary>
/// The typed view of a <see cref="Rendition"/> row: ONLY what a destination
/// overrides. Segment positions are 0-based (0 = the root segment), the same
/// numbering as <c>PublicationSegmentResult</c>.
/// </summary>
public sealed record RenditionOverrides(
	IReadOnlyDictionary<int, string> Texts,
	RenditionMediaOverride? Media,
	RenditionSettings? Settings
) {
	public static readonly RenditionOverrides None = new(
		new Dictionary<int, string>(), null, null
	);

	private static readonly JsonSerializerOptions _Json = new(JsonSerializerDefaults.Web);

	public bool IsEmpty {
		get { return this.Texts.Count == 0 && this.Media is null && this.Settings is null; }
	}

	public static RenditionOverrides FromRow(Rendition row) {
		return new RenditionOverrides(
			RenditionOverrides.ReadTexts(row.TextOverrides),
			RenditionOverrides._ReadMedia(row.MediaOverride),
			RenditionOverrides._ReadSettings(row.Settings)
		);
	}

	/// <summary>Parses just the text map (list/queue previews only need segment 0).</summary>
	public static IReadOnlyDictionary<int, string> ReadTexts(string? json) {
		if (string.IsNullOrWhiteSpace(json)) {
			return new Dictionary<int, string>();
		}

		return JsonSerializer.Deserialize<Dictionary<int, string>>(json, RenditionOverrides._Json)
			?? new Dictionary<int, string>();
	}

	public void WriteTo(Rendition row) {
		row.TextOverrides = JsonSerializer.Serialize(this.Texts, RenditionOverrides._Json);
		row.MediaOverride = this.Media is null
			? null
			: JsonSerializer.Serialize(
				new MediaJson { AssetIds = this.Media.AssetIds?.ToList(), AltTexts = this.Media.AltTexts.ToDictionary() },
				RenditionOverrides._Json
			);
		row.Settings = this.Settings is null
			? "{}"
			: JsonSerializer.Serialize(
				new SettingsJson { Visibility = this.Settings.Visibility },
				RenditionOverrides._Json
			);
	}

	private static RenditionMediaOverride? _ReadMedia(string? json) {
		if (string.IsNullOrWhiteSpace(json)) {
			return null;
		}

		var media = JsonSerializer.Deserialize<MediaJson>(json, RenditionOverrides._Json);
		return media is null
			? null
			: new RenditionMediaOverride(media.AssetIds, media.AltTexts ?? []);
	}

	private static RenditionSettings? _ReadSettings(string? json) {
		if (string.IsNullOrWhiteSpace(json)) {
			return null;
		}

		var settings = JsonSerializer.Deserialize<SettingsJson>(json, RenditionOverrides._Json);
		return settings?.Visibility is null ? null : new RenditionSettings(settings.Visibility);
	}

	private sealed class MediaJson {
		[JsonPropertyName("assetIds")]
		public List<Guid>? AssetIds { get; set; }

		[JsonPropertyName("altTexts")]
		public Dictionary<Guid, string>? AltTexts { get; set; }
	}

	private sealed class SettingsJson {
		[JsonPropertyName("visibility")]
		public string? Visibility { get; set; }
	}
}

/// <summary>Why an override set is structurally unusable (before provider limits apply).</summary>
public enum RenditionOverrideFailureKind {
	// A text override for a segment the post does not have: overrides never add segments.
	SegmentOutOfRange,
	SegmentTextBlank,
	SegmentTextTooLong,
	UnknownAsset,
	DuplicateAsset,
	AltTextTooLong,
}

/// <param name="SegmentNumber">1-based segment at fault, 0 when none.</param>
public sealed record RenditionOverrideFailure(
	RenditionOverrideFailureKind Kind,
	string Cause,
	int SegmentNumber = 0,
	Guid? AssetId = null,
	string? Destination = null,
	Guid? SocialAccountId = null
);

/// <summary>
/// Wire parsing for the destination list and override objects of the schedule,
/// publish-now and rendition endpoints. The validators call the <c>TryParse*</c>
/// methods; the handlers call them again after validation to read the values.
/// </summary>
public static class RenditionWire {
	public const int MaxDestinations = 50;

	/// <summary>One parsed destination of a multi-destination request.</summary>
	public sealed record Destination(
		Guid SocialAccountId,
		DateTime? ScheduledAtUtc,
		RenditionOverrides? Overrides
	);

	public static bool TryParseDestinations(
		JsonElement element,
		bool allowSchedule,
		out List<Destination> destinations,
		out string error
	) {
		destinations = [];
		error = string.Empty;
		if (element.ValueKind != JsonValueKind.Array) {
			error = "destinations must be an array";
			return false;
		}

		if (element.GetArrayLength() is 0 or > RenditionWire.MaxDestinations) {
			error = $"destinations must hold 1 to {RenditionWire.MaxDestinations} items";
			return false;
		}

		var index = 0;
		foreach (var item in element.EnumerateArray()) {
			var label = $"destinations[{index}]";
			index += 1;
			if (item.ValueKind != JsonValueKind.Object) {
				error = $"{label} must be an object";
				return false;
			}

			if (!item.TryGetProperty("socialAccountId", out var idElement)
				|| idElement.ValueKind != JsonValueKind.String
				|| !Guid.TryParse(idElement.GetString(), out var accountId)) {
				error = $"{label}.socialAccountId must be a valid GUID";
				return false;
			}

			DateTime? scheduledAt = null;
			if (item.TryGetProperty("scheduledAt", out var scheduledElement)
				&& scheduledElement.ValueKind != JsonValueKind.Null) {
				if (!allowSchedule) {
					error = $"{label}.scheduledAt is not accepted here";
					return false;
				}

				if (scheduledElement.ValueKind != JsonValueKind.String
					|| !DateUtils.TryParseIsoUtc(scheduledElement.GetString(), out var parsed)) {
					error = $"{label}.scheduledAt must be a valid ISO 8601 date";
					return false;
				}

				scheduledAt = parsed;
			}

			RenditionOverrides? overrides = null;
			if (item.TryGetProperty("overrides", out var overridesElement)
				&& overridesElement.ValueKind != JsonValueKind.Null) {
				if (!RenditionWire.TryParseOverrides(overridesElement, out overrides, out var overridesError)) {
					error = $"{label}.overrides: {overridesError}";
					return false;
				}
			}

			if (destinations.Any(existing => existing.SocialAccountId == accountId)) {
				error = $"{label}.socialAccountId is listed twice";
				return false;
			}

			destinations.Add(new Destination(accountId, scheduledAt, overrides));
		}

		return true;
	}

	public static bool TryParseOverrides(
		JsonElement element,
		out RenditionOverrides overrides,
		out string error
	) {
		overrides = RenditionOverrides.None;
		error = "must be an object";
		if (element.ValueKind != JsonValueKind.Object) {
			return false;
		}

		element.TryGetProperty("segments", out var segments);
		element.TryGetProperty("media", out var media);
		element.TryGetProperty("settings", out var settings);
		return RenditionWire.TryParseOverrides(segments, media, settings, out overrides, out error);
	}

	/// <summary>
	/// Parses the three override parts (each may be Undefined/null = not overridden).
	/// Shared by the nested <c>overrides</c> object and the rendition PUT body.
	/// </summary>
	public static bool TryParseOverrides(
		JsonElement segments,
		JsonElement mediaElement,
		JsonElement settingsElement,
		out RenditionOverrides overrides,
		out string error
	) {
		overrides = RenditionOverrides.None;
		error = string.Empty;
		var texts = new Dictionary<int, string>();
		if (segments.ValueKind is not (JsonValueKind.Undefined or JsonValueKind.Null)) {
			if (segments.ValueKind != JsonValueKind.Array) {
				error = "segments must be an array";
				return false;
			}

			foreach (var segment in segments.EnumerateArray()) {
				if (segment.ValueKind != JsonValueKind.Object
					|| !segment.TryGetProperty("position", out var position)
					|| !position.TryGetInt32(out var positionValue)
					|| positionValue < 0
					|| !segment.TryGetProperty("text", out var text)
					|| text.ValueKind != JsonValueKind.String
					|| !texts.TryAdd(positionValue, text.GetString() ?? string.Empty)) {
					error = "segments must hold unique {position, text} items";
					return false;
				}
			}
		}

		RenditionMediaOverride? media = null;
		if (mediaElement.ValueKind is not (JsonValueKind.Undefined or JsonValueKind.Null)
			&& !RenditionWire._TryParseMedia(mediaElement, out media, out error)) {
			return false;
		}

		RenditionSettings? settings = null;
		if (settingsElement.ValueKind is not (JsonValueKind.Undefined or JsonValueKind.Null)) {
			if (settingsElement.ValueKind != JsonValueKind.Object) {
				error = "settings must be an object";
				return false;
			}

			if (settingsElement.TryGetProperty("visibility", out var visibility)
				&& visibility.ValueKind != JsonValueKind.Null) {
				var visibilityValue = visibility.ValueKind == JsonValueKind.String
					? visibility.GetString()
					: null;
				if (string.IsNullOrWhiteSpace(visibilityValue)
					|| visibilityValue.Length > RenditionSettings.VisibilityMaxLength) {
					error = $"settings.visibility must be 1 to {RenditionSettings.VisibilityMaxLength} characters";
					return false;
				}

				settings = new RenditionSettings(visibilityValue);
			}
		}

		overrides = new RenditionOverrides(texts, media, settings);
		return true;
	}

	private static bool _TryParseMedia(
		JsonElement element,
		out RenditionMediaOverride? media,
		out string error
	) {
		media = null;
		error = "media must be {assetIds, altTexts}";
		if (element.ValueKind != JsonValueKind.Object) {
			return false;
		}

		List<Guid>? assetIds = null;
		if (element.TryGetProperty("assetIds", out var ids) && ids.ValueKind != JsonValueKind.Null) {
			if (ids.ValueKind != JsonValueKind.Array) {
				return false;
			}

			assetIds = [];
			foreach (var id in ids.EnumerateArray()) {
				if (id.ValueKind != JsonValueKind.String || !Guid.TryParse(id.GetString(), out var parsed)) {
					return false;
				}

				assetIds.Add(parsed);
			}
		}

		var altTexts = new Dictionary<Guid, string>();
		if (element.TryGetProperty("altTexts", out var alts) && alts.ValueKind != JsonValueKind.Null) {
			if (alts.ValueKind != JsonValueKind.Array) {
				return false;
			}

			foreach (var alt in alts.EnumerateArray()) {
				if (alt.ValueKind != JsonValueKind.Object
					|| !alt.TryGetProperty("assetId", out var assetId)
					|| assetId.ValueKind != JsonValueKind.String
					|| !Guid.TryParse(assetId.GetString(), out var assetGuid)
					|| !alt.TryGetProperty("altText", out var altText)
					|| altText.ValueKind != JsonValueKind.String
					|| !altTexts.TryAdd(assetGuid, altText.GetString() ?? string.Empty)) {
					return false;
				}
			}
		}

		media = new RenditionMediaOverride(assetIds, altTexts);
		error = string.Empty;
		return true;
	}

	/// <summary>Structural bounds checked once the post's content is known.</summary>
	public static RenditionOverrideFailure? Validate(
		SourceContent source,
		RenditionOverrides overrides
	) {
		var segmentCount = source.FollowUps.Count + 1;
		foreach (var (position, text) in overrides.Texts.OrderBy(entry => entry.Key)) {
			if (position >= segmentCount) {
				return new RenditionOverrideFailure(
					RenditionOverrideFailureKind.SegmentOutOfRange,
					$"Segment {position + 1} does not exist: the post has {segmentCount}. "
						+ "A customized destination can change segment texts, not their number.",
					position + 1
				);
			}

			if (string.IsNullOrWhiteSpace(text)) {
				return new RenditionOverrideFailure(
					RenditionOverrideFailureKind.SegmentTextBlank,
					$"Segment {position + 1}: a customized text cannot be blank. "
						+ "Reset the destination to inherit the shared text.",
					position + 1
				);
			}

			if (text.Length > PostValidationRules.BodyMaxLength) {
				return new RenditionOverrideFailure(
					RenditionOverrideFailureKind.SegmentTextTooLong,
					$"Segment {position + 1}: the text is longer than "
						+ $"{PostValidationRules.BodyMaxLength} characters.",
					position + 1
				);
			}
		}

		if (overrides.Media is null) {
			return null;
		}

		var known = source.Assets.Select(asset => asset.Id).ToHashSet();
		var seen = new HashSet<Guid>();
		foreach (var assetId in overrides.Media.AssetIds ?? []) {
			if (!known.Contains(assetId)) {
				return new RenditionOverrideFailure(
					RenditionOverrideFailureKind.UnknownAsset,
					$"Image {assetId} does not belong to this post.",
					AssetId: assetId
				);
			}

			if (!seen.Add(assetId)) {
				return new RenditionOverrideFailure(
					RenditionOverrideFailureKind.DuplicateAsset,
					$"Image {assetId} is listed twice.",
					AssetId: assetId
				);
			}
		}

		foreach (var (assetId, altText) in overrides.Media.AltTexts) {
			if (!known.Contains(assetId)) {
				return new RenditionOverrideFailure(
					RenditionOverrideFailureKind.UnknownAsset,
					$"Image {assetId} does not belong to this post.",
					AssetId: assetId
				);
			}

			if (altText.Length > PostValidationRules.ImageAltTextMaxLength) {
				return new RenditionOverrideFailure(
					RenditionOverrideFailureKind.AltTextTooLong,
					$"The alt text of image {assetId} is longer than "
						+ $"{PostValidationRules.ImageAltTextMaxLength} characters.",
					AssetId: assetId
				);
			}
		}

		return null;
	}
}
