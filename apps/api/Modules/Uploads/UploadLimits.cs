namespace PublyApp.Api.Modules.Uploads;

/// <summary>
/// Named headroom constants for the two transport-level bounds layered above
/// <c>AppEnvironment.UPLOAD_MAX_BYTES</c> on the staff upload endpoint. Their
/// relative ordering matters: <see cref="MultipartHeaderHeadroomBytes"/> (the
/// <c>RequestSizeLimitAttribute</c> on <c>CreateStaffUpload</c>, checked by
/// Kestrel's <c>IHttpMaxRequestBodySizeFeature</c>) must trip before
/// <see cref="FormOptionsHeadroomBytes"/> (the shared
/// <c>FormOptions.MultipartBodyLengthLimit</c>, enforced later by the multipart
/// reader during form binding) — otherwise an oversize upload on this endpoint
/// would 400 instead of the intended 413. Keeping both here in one file (instead
/// of duplicated literals) means changing one always changes the other.
/// </summary>
public static class UploadLimits {
	public const int MultipartHeaderHeadroomBytes = 8192;
	public const int FormOptionsHeadroomBytes = 1_048_576;

	/// <summary>
	/// The size cap as the user reads it: decimal units, floored to a tenth so the
	/// text never reads above the real limit and matches the front's
	/// <c>formatBytes(bytes, language, 'limit')</c> (16 777 216 B reads "16.7 MB").
	/// </summary>
	public static string FormatLimit(long bytes) {
		string[] units = ["B", "KB", "MB", "GB"];
		var exponent = 0;
		while (exponent < units.Length - 1 && bytes >= Math.Pow(1000, exponent + 1)) {
			exponent++;
		}
		if (exponent == 0) {
			return $"{bytes} B";
		}
		var tenths = Math.Floor(((bytes / Math.Pow(1000, exponent)) * 10) + 1e-9) / 10;
		return string.Create(
			System.Globalization.CultureInfo.InvariantCulture, $"{tenths:0.#} {units[exponent]}"
		);
	}
}
