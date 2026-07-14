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
}
