using FluentAssertions;

using PublyApp.Api.Lib.Testing.Helpers;

using SkiaSharp;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Providers;

public sealed class ImageDerivativeSpec {
	private const long _Limit = 1_000_000;

	[Fact]
	public void ItShouldReturnAnImageThatAlreadyFitsUnchanged() {
		var png = TestImages.Png(30, 20);

		var outcome = ImageDerivative.Fit(png, "image/png", 30, 20, ImageDerivativeSpec._Limit);

		var fitted = outcome.Should().BeOfType<ImageDerivative.Fitted>().Subject;
		fitted.Content.Should().BeSameAs(png);
		fitted.ContentType.Should().Be("image/png");
		(fitted.WidthPx, fitted.HeightPx).Should().Be((30, 20));
	}

	[Fact]
	public void ItShouldBakeTheExifOrientationEvenWhenTheImageIsUnderTheCap() {
		// A 60 x 40 phone photo stored sideways: EXIF orientation 6 displays it 40 x 60.
		var photo = TestImages.JpegWithOrientation(60, 40, orientation: 6);
		photo.LongLength.Should().BeLessThan(ImageDerivativeSpec._Limit);

		var outcome = ImageDerivative.Fit(photo, "image/jpeg", 60, 40, ImageDerivativeSpec._Limit);

		var fitted = outcome.Should().BeOfType<ImageDerivative.Fitted>().Subject;
		fitted.Content.Should().NotBeSameAs(photo);
		fitted.ContentType.Should().Be("image/jpeg");
		(fitted.WidthPx, fitted.HeightPx).Should().Be((40, 60));
		fitted.Content.LongLength.Should().BeLessThanOrEqualTo(ImageDerivativeSpec._Limit);
		using var codec = SKCodec.Create(new MemoryStream(fitted.Content));
		(codec.Info.Width, codec.Info.Height).Should().Be((40, 60));
		codec.EncodedOrigin.Should().Be(SKEncodedOrigin.TopLeft);

		// Stored left half red, right half blue; orientation 6 turns the photo a
		// quarter turn clockwise, so red ends up on top and blue at the bottom.
		using var pixels = SKBitmap.Decode(fitted.Content);
		pixels.GetPixel(20, 10).Red.Should().BeGreaterThan(pixels.GetPixel(20, 10).Blue);
		pixels.GetPixel(20, 50).Blue.Should().BeGreaterThan(pixels.GetPixel(20, 50).Red);
	}

	[Fact]
	public void ItShouldKeepARotatedPngUnderTheCapAsPngNotWebp() {
		using var bitmap = new SKBitmap(30, 20);
		using var data = bitmap.Encode(SKEncodedImageFormat.Png, 100);
		var png = ImageDerivativeSpec._WithExifOrientation(data.ToArray(), 6);

		var outcome = ImageDerivative.Fit(png, "image/png", 30, 20, ImageDerivativeSpec._Limit);

		var result = outcome.Should().BeOfType<ImageDerivative.Fitted>().Subject;
		result.ContentType.Should().Be("image/png");
	}

	[Fact]
	public void ItShouldRefuseAnAnimatedPngEvenUnderTheCap() {
		var apng = TestImages.Apng(20, 20);

		var outcome = ImageDerivative.Fit(apng, "image/png", 20, 20, ImageDerivativeSpec._Limit);

		outcome.Should().BeOfType<ImageDerivative.CannotFit>().Subject.Reason
			.Should().Contain("animated");
	}

	[Theory]
	[InlineData(0, false)]
	[InlineData(2, true)]
	public void ItShouldOnlyCallAPngAnimatedWhenItsAnimationChunkPrecedesTheImageData(
		int frames,
		bool afterIdat
	) {
		var png = TestImages.Apng(20, 20, (byte)frames, afterIdat);

		var outcome = ImageDerivative.Fit(png, "image/png", 20, 20, ImageDerivativeSpec._Limit);

		outcome.Should().BeOfType<ImageDerivative.Fitted>("a zero-frame or late acTL is a still");
	}

	[Fact]
	public void ItShouldRefuseARotatedImageOverTheDecodeCapInsteadOfPublishingItSideways() {
		// A small rotated JPEG whose frame header claims 9000 x 5000 (45 MP, over
		// the cap): it cannot be rotated, and unrotated it would publish sideways.
		var photo = TestImages.JpegWithOrientation(60, 40, orientation: 6);
		var sof = photo.AsSpan().IndexOf(new byte[] { 0xFF, 0xC0 });
		sof.Should().BeGreaterThan(0, "the fixture is a baseline JPEG");
		System.Buffers.Binary.BinaryPrimitives.WriteUInt16BigEndian(photo.AsSpan(sof + 5, 2), 5000);
		System.Buffers.Binary.BinaryPrimitives.WriteUInt16BigEndian(photo.AsSpan(sof + 7, 2), 9000);

		var outcome = ImageDerivative.Fit(photo, "image/jpeg", 60, 40, ImageDerivativeSpec._Limit);

		outcome.Should().BeOfType<ImageDerivative.CannotFit>().Subject.Reason
			.Should().Contain("too large");
	}

	[Fact]
	public void ItShouldKeepAnUprightImageUnderTheCapByteForByte() {
		var photo = TestImages.JpegWithOrientation(60, 40, orientation: 1);

		var outcome = ImageDerivative.Fit(photo, "image/jpeg", 60, 40, ImageDerivativeSpec._Limit);

		outcome.Should().BeOfType<ImageDerivative.Fitted>().Subject.Content.Should().BeSameAs(photo);
	}

	[Fact]
	public void ItShouldShrinkAnOversizedJpegBelowTheLimitKeepingItJpegAndItsRatio() {
		var big = TestImages.NoisyJpeg(3000, 2000);
		big.Length.Should().BeGreaterThan(1_000_000);

		var outcome = ImageDerivative.Fit(big, "image/jpeg", 3000, 2000, ImageDerivativeSpec._Limit);

		var fitted = outcome.Should().BeOfType<ImageDerivative.Fitted>().Subject;
		fitted.Content.Length.Should().BeLessThanOrEqualTo(1_000_000);
		fitted.ContentType.Should().Be("image/jpeg");
		Math.Max(fitted.WidthPx, fitted.HeightPx).Should().BeLessThanOrEqualTo(2048, "the longest edge was stepped down");
		((double)fitted.WidthPx / fitted.HeightPx).Should().BeApproximately(1.5, 0.02);
		using var decoded = SKBitmap.Decode(fitted.Content);
		(decoded.Width, decoded.Height).Should().Be((fitted.WidthPx, fitted.HeightPx));
	}

	[Fact]
	public void ItShouldReEncodeAnOversizedPngAsWebp() {
		var limit = 2_000L;
		var png = TestImages.Png(400, 300);
		png.LongLength.Should().BeGreaterThan(limit, "the fixture must exceed the tiny test limit");

		var outcome = ImageDerivative.Fit(png, "image/png", 400, 300, limit);

		var fitted = outcome.Should().BeOfType<ImageDerivative.Fitted>().Subject;
		fitted.ContentType.Should().Be("image/webp");
		fitted.Content.LongLength.Should().BeLessThanOrEqualTo(limit);
	}

	[Fact]
	public void ItShouldReportCannotFitForBytesThatAreNotAnImage() {
		var garbage = new byte[1_200_000];
		new Random(3).NextBytes(garbage);

		var outcome = ImageDerivative.Fit(garbage, "image/jpeg", 100, 100, ImageDerivativeSpec._Limit);

		outcome.Should().BeOfType<ImageDerivative.CannotFit>();
	}

	[Fact]
	public void ItShouldReportCannotFitWhenNoStepCompressesBelowTheLimit() {
		var noisy = TestImages.NoisyJpeg(800, 800);

		var outcome = ImageDerivative.Fit(noisy, "image/jpeg", 800, 800, 300);

		outcome.Should().BeOfType<ImageDerivative.CannotFit>();
	}

	[Fact]
	public void ItShouldRefuseACanvasOverTheDecodePixelCapWithoutDecodingIt() {
		// A real PNG whose IHDR claims 9000 x 5000 (45 MP, over the 40 MP cap);
		// only the header is read to refuse it, and the CRC is recomputed so the
		// codec accepts the header.
		var png = TestImages.Png(8, 8);
		System.Buffers.Binary.BinaryPrimitives.WriteInt32BigEndian(png.AsSpan(16, 4), 9000);
		System.Buffers.Binary.BinaryPrimitives.WriteInt32BigEndian(png.AsSpan(20, 4), 5000);
		System.Buffers.Binary.BinaryPrimitives.WriteUInt32BigEndian(
			png.AsSpan(29, 4),
			ImageDerivativeSpec._Crc32(png.AsSpan(12, 17))
		);

		var outcome = ImageDerivative.Fit(png, "image/png", 9000, 5000, maxBytes: 10);

		outcome.Should().BeOfType<ImageDerivative.CannotFit>().Subject.Reason
			.Should().Contain("too large");
	}

	// A PNG holds EXIF in an eXIf chunk (big-endian TIFF block) before IDAT.
	private static byte[] _WithExifOrientation(byte[] png, int orientation) {
		byte[] tiff = [
			.. "MM\0*\0\0\0\b"u8,
			0, 1,
			0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, (byte)orientation, 0, 0,
			0, 0, 0, 0,
		];
		byte[] typeAndData = [.. "eXIf"u8, .. tiff];
		var crc = ImageDerivativeSpec._Crc32(typeAndData);
		byte[] chunk = [
			0, 0, 0, (byte)tiff.Length,
			.. typeAndData,
			(byte)(crc >> 24), (byte)(crc >> 16), (byte)(crc >> 8), (byte)crc,
		];
		const int afterIhdr = 8 + 25;
		return [.. png[..afterIhdr], .. chunk, .. png[afterIhdr..]];
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
}
