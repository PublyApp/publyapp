using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Infrastructure.Storage;

/// <summary>
/// Header-parsing guard for the post-image inspector (#639). Fixtures are
/// hand-built byte arrays whose headers carry REAL dimensions — the same
/// magic-byte-sniffing trust level as CreateStaffUpload, plus the dimension
/// extraction the attach endpoint stores on the asset row. A wrong signature
/// or a truncated header yields <see cref="ImageInspector.UnknownType"/>; a
/// recognized type declaring a degenerate canvas yields
/// <see cref="ImageInspector.DegenerateDimensions"/> — so the handler can name
/// EACH cause instead of persisting garbage.
/// </summary>
public sealed class ImageInspectorSpec {
	// PNG: signature + IHDR length/type + 4-byte width + 4-byte height (big-endian).
	private static byte[] PngBytes(int width, int height) {
		var bytes = new List<byte> {
			0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
			0x00, 0x00, 0x00, 0x0D,
			(byte)'I', (byte)'H', (byte)'D', (byte)'R',
		};
		bytes.AddRange(BitConverter.GetBytes(
			System.Buffers.Binary.BinaryPrimitives.ReverseEndianness(width)
		));
		bytes.AddRange(BitConverter.GetBytes(
			System.Buffers.Binary.BinaryPrimitives.ReverseEndianness(height)
		));
		return [.. bytes];
	}

	// GIF: signature + logical screen descriptor width/height (little-endian uint16).
	private static byte[] GifBytes(int width, int height) {
		return [
			(byte)'G', (byte)'I', (byte)'F', (byte)'8', (byte)'9', (byte)'a',
			(byte)(width & 0xFF), (byte)((width >> 8) & 0xFF),
			(byte)(height & 0xFF), (byte)((height >> 8) & 0xFF),
			0x00, 0x00,
		];
	}

	// WebP VP8X extended format: RIFF header + WEBP + VP8X chunk whose canvas
	// width-1 / height-1 are 24-bit little-endian values starting at byte 24.
	private static byte[] WebpVp8xBytes(int width, int height) {
		return [
			(byte)'R', (byte)'I', (byte)'F', (byte)'F',
			0x1A, 0x00, 0x00, 0x00,
			(byte)'W', (byte)'E', (byte)'B', (byte)'P',
			(byte)'V', (byte)'P', (byte)'8', (byte)'X',
			0x0A, 0x00, 0x00, 0x00,
			0x10, 0x00, 0x00, 0x00,
			(byte)(((width - 1) & 0xFF)),
			(byte)((((width - 1) >> 8) & 0xFF)),
			(byte)((((width - 1) >> 16) & 0xFF)),
			(byte)(((height - 1) & 0xFF)),
			(byte)((((height - 1) >> 8) & 0xFF)),
			(byte)((((height - 1) >> 16) & 0xFF)),
		];
	}

	// JPEG: SOI + APP0(JFIF) then an SOF0 segment carrying height/width
	// (big-endian uint16 each, height first per the JPEG spec).
	private static byte[] JpegBytes(int width, int height) {
		var sof = new List<byte> {
			0xFF, 0xC0,
			0x00, 0x11,
			0x08,
			(byte)((height >> 8) & 0xFF), (byte)(height & 0xFF),
			(byte)((width >> 8) & 0xFF), (byte)(width & 0xFF),
			0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
		};
		var bytes = new List<byte> {
			0xFF, 0xD8,
			0xFF, 0xE0, 0x00, 0x10, (byte)'J', (byte)'F', (byte)'I', (byte)'F', 0x00,
			0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
		};
		bytes.AddRange(sof);
		return [.. bytes];
	}

	[Theory]
	[InlineData(1, 1)]
	[InlineData(640, 480)]
	[InlineData(1920, 1080)]
	public void ItShouldReadRealDimensionsFromPngHeaders(int width, int height) {
		var inspected = RunInspector(PngBytes(width, height)).Should()
			.BeOfType<ImageInspector.Inspected>().Which;

		inspected.ContentType.Should().Be("image/png");
		inspected.Extension.Should().Be(".png");
		inspected.WidthPx.Should().Be(width);
		inspected.HeightPx.Should().Be(height);
	}

	[Theory]
	[InlineData(1, 1)]
	[InlineData(800, 600)]
	public void ItShouldReadRealDimensionsFromGifHeaders(int width, int height) {
		var inspected = RunInspector(GifBytes(width, height)).Should()
			.BeOfType<ImageInspector.Inspected>().Which;

		inspected.ContentType.Should().Be("image/gif");
		inspected.Extension.Should().Be(".gif");
		inspected.WidthPx.Should().Be(width);
		inspected.HeightPx.Should().Be(height);
	}

	[Theory]
	[InlineData(1, 1)]
	[InlineData(1024, 768)]
	public void ItShouldReadRealDimensionsFromWebpVp8xHeaders(int width, int height) {
		var inspected = RunInspector(WebpVp8xBytes(width, height)).Should()
			.BeOfType<ImageInspector.Inspected>().Which;

		inspected.ContentType.Should().Be("image/webp");
		inspected.Extension.Should().Be(".webp");
		inspected.WidthPx.Should().Be(width);
		inspected.HeightPx.Should().Be(height);
	}

	[Fact]
	public void ItShouldReadRealDimensionsFromJpegSofHeaders() {
		var inspected = RunInspector(JpegBytes(width: 300, height: 200))
			.Should().BeOfType<ImageInspector.Inspected>().Which;

		inspected.ContentType.Should().Be("image/jpeg");
		inspected.Extension.Should().Be(".jpg");
		inspected.WidthPx.Should().Be(300);
		inspected.HeightPx.Should().Be(200);
	}

	[Fact]
	public void ItShouldRejectPlainTextWithAnUnknownTypeOutcome() {
		var bytes = "definitely not an image"u8.ToArray();
		RunInspector(bytes).Should().BeOfType<ImageInspector.UnknownType>(
			"a non-image payload must never pass, whatever its file name"
		);
	}

	[Fact]
	public void ItShouldRejectATruncatedPngHeader() {
		var full = PngBytes(64, 64);
		RunInspector(full[..12]).Should().BeOfType<ImageInspector.UnknownType>(
			"an incomplete header cannot yield trustworthy dimensions"
		);
	}

	[Fact]
	public void ItShouldNameAZeroSizedGifCanvasAsDegenerateDimensions() {
		RunInspector(GifBytes(0, 0)).Should()
			.BeOfType<ImageInspector.DegenerateDimensions>(
				"zero-sized canvases were rejected by the upload pipeline "
				+ "(round-5 F5); the inspector keeps that bar and names the "
				+ "dimensions — not the recognized type — as the cause"
			);
	}

	[Fact]
	public void ItShouldLeaveTheStreamPositionUnspecifiedButRewindable() {
		// Contract with callers: they rewind before saving. The inspector may read
		// past the header; callers must not assume a position.
		using var stream = new MemoryStream(PngBytes(32, 16));
		_ = ImageInspector.Inspect(stream);
		stream.Position = 0;
		var second = ImageInspector.Inspect(stream).Should()
			.BeOfType<ImageInspector.Inspected>().Which;
		second.WidthPx.Should().Be(32);
	}

	private static ImageInspector.Inspection RunInspector(byte[] bytes) {
		using var stream = new MemoryStream(bytes);
		return ImageInspector.Inspect(stream);
	}
}
