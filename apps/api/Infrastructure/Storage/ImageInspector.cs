using System.Buffers.Binary;

namespace PublyApp.Api.Infrastructure.Storage;

/// <summary>
/// Header-only image type + dimension reader for post-image attaches (#639).
///
/// Same trust level as <c>CreateStaffUpload.SniffImageType</c> (magic bytes,
/// never client-supplied names or Content-Type), extended to also extract the
/// intrinsic pixel dimensions from each format's header so the attach endpoint
/// can persist width/height on the asset row and read models can expose them.
///
/// Known gap, inherited from round-5 API F5: signatures are parsed, bodies are
/// never decoded — a valid signature followed by arbitrary data still passes.
/// The extension rewrite plus <c>nosniff</c> on served uploads block the
/// stored-XSS vector this would otherwise open; a full decode needs a hardened
/// image library and stays out of scope here.
///
/// Returns a typed outcome for anything it cannot confidently accept:
/// <see cref="UnknownType"/> (unknown signature, truncated header) or
/// <see cref="DegenerateDimensions"/> (a recognized type declaring a ≤ 0 px
/// canvas) — callers turn each into its own named validation refusal, never a
/// persisted row. Leaves the stream position unspecified on return; callers
/// rewind before reading again.
/// </summary>
public static class ImageInspector {
	public abstract record Inspection;

	public sealed record Inspected(
		string ContentType,
		string Extension,
		int WidthPx,
		int HeightPx
	) : Inspection;

	public sealed record UnknownType : Inspection;

	public sealed record DegenerateDimensions : Inspection;

	// Fixed initial read window covering every format's fixed-size header
	// (PNG IHDR ends at byte 24, WebP VP8X canvas at 30, WebP frames at 30).
	private const int SniffWindowBytes = 64;

	// Longest fixed magic prefix among supported types (WebP RIFF/size/WEBP).
	private const int MinimumBytes = 12;

	// JPEG SOF markers sit behind variable-length APPn segments (EXIF can be
	// tens of KB), so that format walks markers streaming-style under a bound.
	private const long MaxJpegScanBytes = 64 * 1024;

	public static Inspection Inspect(Stream stream) {
		Span<byte> header = stackalloc byte[SniffWindowBytes];
		var read = stream.ReadAtLeast(
			header,
			MinimumBytes,
			throwOnEndOfStream: false
		);
		if (read < MinimumBytes) {
			return new UnknownType();
		}

		ReadOnlySpan<byte> view = header[..read];

		if (IsPng(view)) {
			return ParsePng(view);
		}
		if (IsGif(view)) {
			return ParseGif(view);
		}
		if (IsWebP(view)) {
			return ParseWebP(view);
		}
		if (IsJpeg(view)) {
			return ParseJpeg(stream);
		}

		return new UnknownType();
	}

	private static bool IsPng(ReadOnlySpan<byte> header) {
		return header.Length >= 16
			&& header[..8].SequenceEqual(
				(ReadOnlySpan<byte>)[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
			)
			&& header[12..16].SequenceEqual("IHDR"u8);
	}

	private static Inspection ParsePng(ReadOnlySpan<byte> header) {
		// IHDR payload: 4-byte big-endian width then height, bytes 16..23.
		if (header.Length < 24) {
			return new UnknownType();
		}
		var width = BinaryPrimitives.ReadInt32BigEndian(header[16..20]);
		var height = BinaryPrimitives.ReadInt32BigEndian(header[20..24]);
		if (width <= 0 || height <= 0) {
			return new DegenerateDimensions();
		}
		return new Inspected("image/png", ".png", width, height);
	}

	private static bool IsGif(ReadOnlySpan<byte> header) {
		return header.Length >= 10
			&& (header[..6].SequenceEqual("GIF87a"u8)
				|| header[..6].SequenceEqual("GIF89a"u8));
	}

	private static Inspection ParseGif(ReadOnlySpan<byte> header) {
		// Logical screen descriptor: little-endian uint16 width then height.
		// Zero-sized canvases stay rejected (round-5 F5 bar).
		var width = header[6] | (header[7] << 8);
		var height = header[8] | (header[9] << 8);
		if (width <= 0 || height <= 0) {
			return new DegenerateDimensions();
		}
		return new Inspected("image/gif", ".gif", width, height);
	}

	private static bool IsWebP(ReadOnlySpan<byte> header) {
		return header.Length >= 12
			&& header[..4].SequenceEqual("RIFF"u8)
			&& header[8..12].SequenceEqual("WEBP"u8);
	}

	private static Inspection ParseWebP(ReadOnlySpan<byte> header) {
		if (header.Length >= 16 && header[12..16].SequenceEqual("VP8X"u8)) {
			// Extended format: flags + 3 reserved bytes at 20..23, then canvas
			// (dimension - 1) as three little-endian bytes each at 24..29.
			if (header.Length < 30) {
				return new UnknownType();
			}
			var width = 1 + header[24]
				+ (header[25] << 8)
				+ (header[26] << 16);
			var height = 1 + header[27]
				+ (header[28] << 8)
				+ (header[29] << 16);
			if (width <= 0 || height <= 0) {
				return new DegenerateDimensions();
			}
			return new Inspected("image/webp", ".webp", width, height);
		}

		if (header.Length >= 16 && header[12..16].SequenceEqual("VP8 "u8)) {
			// Simple lossy: frame tag 20..22, sync code 9D 01 2A at 23..25,
			// then 14-bit little-endian width/height at 26..29.
			if (header.Length < 30) {
				return new UnknownType();
			}
			if (header[23] != 0x9D || header[24] != 0x01 || header[25] != 0x2A) {
				return new UnknownType();
			}
			var width = header[26] | ((header[27] & 0x3F) << 8);
			var height = header[28] | ((header[29] & 0x3F) << 8);
			if (width <= 0 || height <= 0) {
				return new DegenerateDimensions();
			}
			return new Inspected("image/webp", ".webp", width, height);
		}

		if (header.Length >= 16 && header[12..16].SequenceEqual("VP8L"u8)) {
			// Lossless: 0x2F signature at 20, then 32 bits where the low 14
			// bits encode width-1 and the next 14 encode height-1.
			if (header.Length < 25 || header[20] != 0x2F) {
				return new UnknownType();
			}
			var bits = BinaryPrimitives.ReadInt32LittleEndian(header[21..25]);
			var width = (bits & 0x3FFF) + 1;
			var height = ((bits >> 14) & 0x3FFF) + 1;
			if (width <= 0 || height <= 0) {
				return new DegenerateDimensions();
			}
			return new Inspected("image/webp", ".webp", width, height);
		}

		return new UnknownType();
	}

	private static bool IsJpeg(ReadOnlySpan<byte> header) {
		return header.Length >= 3
			&& header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF;
	}

	private static Inspection ParseJpeg(Stream stream) {
		// Walk marker segments from the stream start (the sniff left the
		// position unspecified) until an SOFn carries the dimensions. Bounded
		// by MaxJpegScanBytes so a malformed stream cannot spin the walk.
		stream.Position = 0;
		var pair = new byte[2];
		var sofHead = new byte[5];
		long scanned = 0;

		while (scanned <= MaxJpegScanBytes) {
			if (!TryReadExactly(stream, pair)) {
				return new UnknownType();
			}
			scanned += pair.Length;
			if (pair[0] != 0xFF) {
				return new UnknownType();
			}
			var marker = pair[1];
			if (marker is 0xFF or 0xD8 or 0x01 or (>= 0xD0 and <= 0xD7)) {
				// Fill byte or standalone marker: no length field follows.
				continue;
			}

			if (!TryReadExactly(stream, pair)) {
				return new UnknownType();
			}
			scanned += pair.Length;
			var segmentLength = (pair[0] << 8) | pair[1];
			if (segmentLength < 2) {
				return new UnknownType();
			}

			var isStartOfFrame = marker is >= 0xC0 and <= 0xCF
				and not 0xC4 and not 0xC8 and not 0xCC;
			if (isStartOfFrame) {
				// SOFn body: precision byte, then big-endian uint16 height and
				// width (height first per the JPEG spec).
				if (!TryReadExactly(stream, sofHead)) {
					return new UnknownType();
				}
				var height = (sofHead[1] << 8) | sofHead[2];
				var width = (sofHead[3] << 8) | sofHead[4];
				if (width <= 0 || height <= 0) {
					return new DegenerateDimensions();
				}
				return new Inspected("image/jpeg", ".jpg", width, height);
			}

			// Skip the rest of the segment payload (its length counts the two
			// length bytes this walk already consumed).
			var skip = segmentLength - 2;
			stream.Seek(skip, SeekOrigin.Current);
			scanned += skip;
		}

		return new UnknownType();
	}

	private static bool TryReadExactly(Stream stream, byte[] buffer) {
		var offset = 0;
		while (offset < buffer.Length) {
			var read = stream.Read(buffer, offset, buffer.Length - offset);
			if (read == 0) {
				return false;
			}
			offset += read;
		}
		return true;
	}
}
