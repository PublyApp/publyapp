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

	/// <summary>
	/// A real JPEG whose EXIF block says <paramref name="orientation"/> (1-8); the
	/// pixels are stored unrotated at width x height, like a phone photo: the left
	/// half red, the right half blue, so a spec can tell which way it was turned.
	/// </summary>
	public static byte[] JpegWithOrientation(int width, int height, int orientation) {
		var jpeg = TestImages._Encode(TestImages._TwoTone(width, height), SKEncodedImageFormat.Jpeg, 95);
		byte[] exif = [
			.. "Exif\0\0"u8,
			.. "MM\0*\0\0\0\b"u8,
			0, 1,
			0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, (byte)orientation, 0, 0,
			0, 0, 0, 0,
		];
		var length = exif.Length + 2;
		byte[] segment = [0xFF, 0xE1, (byte)(length >> 8), (byte)(length & 0xFF), .. exif];
		return [.. jpeg[..2], .. segment, .. jpeg[2..]];
	}

	/// <summary>
	/// A decodable PNG carrying an acTL (animation control) chunk: an APNG by
	/// default; <paramref name="frames"/> 0 or <paramref name="afterIdat"/> make it
	/// a static PNG that merely mentions the chunk.
	/// </summary>
	public static byte[] Apng(int width, int height, byte frames = 2, bool afterIdat = false) {
		var png = TestImages.Png(width, height);
		var at = afterIdat ? png.Length - 12 : 8 + 25;
		byte[] data = [.. "acTL"u8, 0, 0, 0, frames, 0, 0, 0, 0];
		var crc = TestImages._Crc32(data);
		byte[] chunk = [
			0, 0, 0, 8,
			.. data,
			(byte)(crc >> 24), (byte)(crc >> 16), (byte)(crc >> 8), (byte)crc,
		];
		return [.. png[..at], .. chunk, .. png[at..]];
	}

	/// <summary>
	/// Inserts a chunk right after IHDR (or just before IEND with
	/// <paramref name="afterImageData"/>), with a valid CRC.
	/// </summary>
	public static byte[] WithChunk(
		byte[] png,
		string type,
		byte[] data,
		bool afterImageData = false
	) {
		byte[] typeAndData = [.. System.Text.Encoding.ASCII.GetBytes(type), .. data];
		var crc = TestImages._Crc32(typeAndData);
		byte[] chunk = [
			(byte)(data.Length >> 24), (byte)(data.Length >> 16),
			(byte)(data.Length >> 8), (byte)data.Length,
			.. typeAndData,
			(byte)(crc >> 24), (byte)(crc >> 16), (byte)(crc >> 8), (byte)crc,
		];
		var at = afterImageData ? png.Length - 12 : 8 + 25;
		return [.. png[..at], .. chunk, .. png[at..]];
	}

	private static uint _Crc32(ReadOnlySpan<byte> data) {
		var crc = 0xFFFFFFFFu;
		foreach (var value in data) {
			crc ^= value;
			for (var bit = 0; bit < 8; bit++) {
				crc = (crc & 1) != 0 ? (crc >> 1) ^ 0xEDB88320u : crc >> 1;
			}
		}
		return ~crc;
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

	private static SKBitmap _TwoTone(int width, int height) {
		var bitmap = new SKBitmap(width, height);
		using var canvas = new SKCanvas(bitmap);
		using var red = new SKPaint { Color = SKColors.Red };
		using var blue = new SKPaint { Color = SKColors.Blue };
		canvas.DrawRect(0, 0, width / 2f, height, red);
		canvas.DrawRect(width / 2f, 0, width - (width / 2f), height, blue);
		return bitmap;
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
