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
