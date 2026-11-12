using System.Buffers.Binary;

namespace PublyApp.Api.Infrastructure.Storage;

/// <summary>
/// Animated PNG (APNG) detection by walking the chunk headers (#2179): an
/// <c>acTL</c> chunk of length 8 declaring at least one frame, before the first
/// <c>IDAT</c>. Bounded by the stream length, so a truncated or hostile file can
/// neither throw nor seek past its end. Leaves the stream position unspecified.
/// </summary>
public static class ImageAnimation {
	private const int _SignatureLength = 8;
	private const int _ChunkHeaderLength = 8;
	private const int _ChunkOverhead = 12;

	public static bool IsAnimatedPng(Stream stream) {
		if (!stream.CanSeek) {
			return false;
		}

		var total = stream.Length;
		var position = (long)ImageAnimation._SignatureLength;
		Span<byte> header = stackalloc byte[ImageAnimation._ChunkHeaderLength];
		while (position + ImageAnimation._ChunkHeaderLength <= total) {
			stream.Position = position;
			if (stream.ReadAtLeast(header, header.Length, throwOnEndOfStream: false) < header.Length) {
				return false;
			}

			var length = BinaryPrimitives.ReadUInt32BigEndian(header[..4]);
			var type = header[4..8];
			if (type.SequenceEqual("acTL"u8)) {
				return length == 8
					&& position + ImageAnimation._ChunkHeaderLength + 4 <= total
					&& ImageAnimation._ReadFrameCount(stream) > 0;
			}

			if (type.SequenceEqual("IDAT"u8) || type.SequenceEqual("IEND"u8)) {
				return false;
			}

			position += ImageAnimation._ChunkOverhead + (long)length;
		}

		return false;
	}

	private static uint _ReadFrameCount(Stream stream) {
		Span<byte> frames = stackalloc byte[4];
		return stream.ReadAtLeast(frames, frames.Length, throwOnEndOfStream: false) == frames.Length
			? BinaryPrimitives.ReadUInt32BigEndian(frames)
			: 0;
	}
}
