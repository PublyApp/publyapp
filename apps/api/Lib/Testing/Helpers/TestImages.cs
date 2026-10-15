using SkiaSharp;

namespace PublyApp.Api.Lib.Testing.Helpers;

/// <summary>
/// Builds REAL decodable images for specs (the attach specs' header-only PNG
/// fixtures cannot be decoded, which publish-time re-encoding needs).
/// </summary>
public static class TestImages {
	public static byte[] Png(int width, int height) {
		return TestImages._Encode(TestImages._Gradient(width, height), SKEncodedImageFormat.Png, 100);
	}

	public static byte[] Jpeg(int width, int height, int quality = 90) {
		return TestImages._Encode(TestImages._Gradient(width, height), SKEncodedImageFormat.Jpeg, quality);
	}

	public static byte[] Webp(int width, int height) {
		return TestImages._Encode(TestImages._Gradient(width, height), SKEncodedImageFormat.Webp, 80);
	}

	/// <summary>Random pixels: incompressible, so a big canvas lands far above 1,000,000 bytes.</summary>
	public static byte[] NoisyJpeg(int width, int height) {
		using var bitmap = new SKBitmap(width, height);
		var random = new Random(42);
		var pixels = new byte[width * height * 4];
		random.NextBytes(pixels);
		for (var index = 3; index < pixels.Length; index += 4) {
			pixels[index] = 255;
		}
		System.Runtime.InteropServices.Marshal.Copy(pixels, 0, bitmap.GetPixels(), pixels.Length);
		return TestImages._Encode(bitmap, SKEncodedImageFormat.Jpeg, 100);
	}

	/// <summary>Minimal animated-WebP header (RIFF + VP8X with the animation flag).</summary>
	public static byte[] AnimatedWebpHeader() {
		var bytes = new byte[30];
		"RIFF"u8.CopyTo(bytes.AsSpan(0));
		bytes[4] = 22;
		"WEBP"u8.CopyTo(bytes.AsSpan(8));
		"VP8X"u8.CopyTo(bytes.AsSpan(12));
		bytes[16] = 10;
		bytes[20] = 0x02;
		bytes[24] = 3;
		bytes[27] = 3;
		return bytes;
	}

	private static SKBitmap _Gradient(int width, int height) {
		var bitmap = new SKBitmap(width, height);
		using var canvas = new SKCanvas(bitmap);
		using var paint = new SKPaint {
			Shader = SKShader.CreateLinearGradient(
				new SKPoint(0, 0),
				new SKPoint(width, height),
				[SKColors.Teal, SKColors.Orange],
				SKShaderTileMode.Clamp
			),
		};
		canvas.DrawRect(0, 0, width, height, paint);
		return bitmap;
	}

	private static byte[] _Encode(SKBitmap bitmap, SKEncodedImageFormat format, int quality) {
		using (bitmap) {
			using var data = bitmap.Encode(format, quality);
			return data.ToArray();
		}
	}
}
