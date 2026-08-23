using System.Text.RegularExpressions;

namespace PublyApp.Api.Infrastructure.Storage;

/// <summary>
/// Extracts the storage-relative path from a served upload URL
/// (<c>/files/uploads/YYYY/MM/&lt;uuid&gt;.png</c> → <c>uploads/YYYY/MM/&lt;uuid&gt;.png</c>),
/// mirroring the validators' served-upload shape
/// (<c>TenantValidationRules</c>, <c>AccountProfileValidationRules</c>) and what
/// <c>CreateStaffUpload</c> returns. Shared by every writer of a logo/avatar URL
/// so reference transitions key on exactly the path the storage layer wrote.
///
/// Absolute http(s) URLs are foreign blobs this API does not own: the extractor
/// rejects them (returns null) and callers skip reference accounting for them.
/// </summary>
public static partial class ServedUploadPath {
	[GeneratedRegex(@"^/files/(uploads/\d{4}/\d{2}/[0-9a-f-]{36}\.(?:png|jpe?g|webp|gif))$")]
	private static partial Regex ServedUrlPattern();

	/// <summary>
	/// Returns the storage-relative path behind a served <c>/files/...</c> URL, or
	/// null when the value is not a served upload URL (absolute http(s), legacy
	/// shape, or garbage). The captured path cannot contain traversal segments by
	/// construction of the pattern.
	/// </summary>
	public static string? ExtractOrNull(string? url) {
		if (string.IsNullOrEmpty(url)) {
			return null;
		}

		var match = ServedUrlPattern().Match(url);
		return match.Success ? match.Groups[1].Value : null;
	}
}
