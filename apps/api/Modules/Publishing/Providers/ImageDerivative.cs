using SkiaSharp;

namespace PublyApp.Api.Modules.Publishing.Providers;

/// <summary>
/// Produces a publish-time derivative of a stored image that fits a provider's
/// per-blob byte limit (#2170): downscale the longest edge in steps and
/// re-encode, stepping quality down, until the bytes fit. JPEG sources stay JPEG;
/// PNG and WebP sources become lossy WebP (keeps transparency). The stored
/// original is never touched — callers pass bytes in and get new bytes out.
/// An image that already fits is returned unchanged.
/// </summary>
internal static class ImageDerivative {
	public abstract record Outcome;

	/// <summary>The bytes to upload; <see cref="WidthPx"/>/<see cref="HeightPx"/> describe THESE bytes.</summary>
	public sealed record Fitted(
		byte[] Content,
		string ContentType,
		int WidthPx,
		int HeightPx
	) : Outcome;

	/// <summary>No derivative could be produced; <see cref="Reason"/> is a plain sentence.</summary>
	public sealed record CannotFit(string Reason) : Outcome;

	private static readonly int[] _LongestEdgeSteps = [2048, 1600, 1280, 1024, 768, 512, 384];
	private static readonly int[] _QualitySteps = [90, 80, 70, 60, 50, 40];

	// Decoding allocates width x height x 4 bytes. Bluesky never needs more than
	// 2048 px on the long edge, and phone cameras top out around 50 MP, so 40 MP
	// (~160 MB per bitmap) is generous for social images while keeping a single
	// image from exhausting the worker.
	private const long _MaxDecodePixels = 40_000_000;

	public static Outcome Fit(
		byte[] source,
		string contentType,
		int widthPx,
		int heightPx,
		long maxBytes
	) {
		if (source.LongLength <= maxBytes) {
			return new Fitted(source, contentType, widthPx, heightPx);
		}

		using var codec = SKCodec.Create(SKData.CreateCopy(source));
		if (codec is null) {
			return new CannotFit("the image could not be decoded");
		}

		if ((long)codec.Info.Width * codec.Info.Height > ImageDerivative._MaxDecodePixels) {
			return new CannotFit("the image is too large to resize");
		}

		using var decoded = SKBitmap.Decode(codec);
		if (decoded is null) {
			return new CannotFit("the image could not be decoded");
		}

		// Only build a second bitmap when the orientation actually needs baking in.
		var needsRotation = codec.EncodedOrigin
			is not (SKEncodedOrigin.TopLeft or SKEncodedOrigin.Default);
		using var rotated = needsRotation
			? ImageDerivative._ApplyOrigin(decoded, codec.EncodedOrigin)
			: null;
		var oriented = rotated ?? decoded;
		var asJpeg = string.Equals(contentType, "image/jpeg", StringComparison.Ordinal);
		var format = asJpeg ? SKEncodedImageFormat.Jpeg : SKEncodedImageFormat.Webp;
		var outputType = asJpeg ? "image/jpeg" : "image/webp";
		var longest = Math.Max(oriented.Width, oriented.Height);

		foreach (var edge in ImageDerivative._LongestEdgeSteps) {
			var target = Math.Min(edge, longest);
			using var resized = target < longest
				? ImageDerivative._ScaleToLongestEdge(oriented, target)
				: null;
			var scaled = resized ?? oriented;

			foreach (var quality in ImageDerivative._QualitySteps) {
				using var data = scaled.Encode(format, quality);
				if (data is null) {
					continue;
				}

				if (data.Size <= maxBytes) {
					return new Fitted(data.ToArray(), outputType, scaled.Width, scaled.Height);
				}
			}
		}

		return new CannotFit(
			$"it could not be compressed below {maxBytes} bytes"
		);
	}

	private static SKBitmap? _ScaleToLongestEdge(SKBitmap source, int longestEdge) {
		var current = Math.Max(source.Width, source.Height);
		var ratio = (double)longestEdge / current;
		var width = Math.Max(1, (int)Math.Round(source.Width * ratio));
		var height = Math.Max(1, (int)Math.Round(source.Height * ratio));
		var info = new SKImageInfo(width, height, source.ColorType, source.AlphaType);
		return source.Resize(info, new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear));
	}

	// Re-encoding drops EXIF, so bake the orientation into the pixels or phone
	// photos would publish sideways.
	private static SKBitmap _ApplyOrigin(SKBitmap source, SKEncodedOrigin origin) {
		var swap = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop
			or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
		var width = swap ? source.Height : source.Width;
		var height = swap ? source.Width : source.Height;
		var result = new SKBitmap(new SKImageInfo(width, height, source.ColorType, source.AlphaType));
		using var canvas = new SKCanvas(result);
		canvas.Clear(SKColors.Transparent);
		canvas.SetMatrix(ImageDerivative._OriginMatrix(origin, source.Width, source.Height));
		canvas.DrawBitmap(source, 0f, 0f, new SKSamplingOptions(SKFilterMode.Nearest), null);
		return result;
	}

	private static SKMatrix _OriginMatrix(SKEncodedOrigin origin, int w, int h) {
		return origin switch {
			SKEncodedOrigin.TopRight => new SKMatrix(-1, 0, w, 0, 1, 0, 0, 0, 1),
			SKEncodedOrigin.BottomRight => new SKMatrix(-1, 0, w, 0, -1, h, 0, 0, 1),
			SKEncodedOrigin.BottomLeft => new SKMatrix(1, 0, 0, 0, -1, h, 0, 0, 1),
			SKEncodedOrigin.LeftTop => new SKMatrix(0, 1, 0, 1, 0, 0, 0, 0, 1),
			SKEncodedOrigin.RightTop => new SKMatrix(0, -1, h, 1, 0, 0, 0, 0, 1),
			SKEncodedOrigin.RightBottom => new SKMatrix(0, -1, h, -1, 0, w, 0, 0, 1),
			SKEncodedOrigin.LeftBottom => new SKMatrix(0, 1, 0, -1, 0, w, 0, 0, 1),
			SKEncodedOrigin.TopLeft => SKMatrix.Identity,
			_ => SKMatrix.Identity,
		};
	}
}
