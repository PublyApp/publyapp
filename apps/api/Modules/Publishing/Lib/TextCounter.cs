using System.Globalization;
using System.Text;

namespace PublyApp.Api.Modules.Publishing.Lib;

/// <summary>
/// Counts post text the way providers do (issue #2169). The browser counterpart
/// (<c>Intl.Segmenter</c>, apps/front text-counter) must agree on every string in
/// the shared fixture file <c>text-counter-fixtures.json</c>.
/// </summary>
public static class TextCounter {
	// The ONE explicit trailing-trim set; the browser mirrors it in
	// apps/front/src/lib/text-counter/text-counter.ts (TRAILING_TRIM). Not
	// char.IsWhiteSpace: it differs from JS trimEnd on U+0085 and U+FEFF.
	private static readonly char[] _TrailingTrim = [
		'\t', '\n', '\v', '\f', '\r', ' ', '\u0085', '\u00A0', '\u1680',
		'\u2000', '\u2001', '\u2002', '\u2003', '\u2004', '\u2005', '\u2006',
		'\u2007', '\u2008', '\u2009', '\u200A', '\u2028', '\u2029', '\u202F',
		'\u205F', '\u3000', '\uFEFF',
	];

	/// <summary>
	/// The text as it is counted AND published: line endings normalised to
	/// <c>\n</c>, trailing whitespace trimmed.
	/// </summary>
	public static string Normalize(string text) {
		return text
			.Replace("\r\n", "\n", StringComparison.Ordinal)
			.Replace('\r', '\n')
			.TrimEnd(TextCounter._TrailingTrim);
	}

	/// <summary>Extended grapheme clusters (user-perceived characters).</summary>
	// ponytail: ceiling - .NET StringInfo lacks the Unicode 15.1 Indic conjunct
	// rule (GB9c), so it counts more than Intl.Segmenter for e.g. Devanagari/
	// Malayalam conjuncts: server is stricter, never looser. Upgrade path:
	// ICU-based segmentation if Indic users complain.
	public static int CountGraphemes(string text) {
		return new StringInfo(TextCounter.Normalize(text)).LengthInTextElements;
	}

	public static int CountBytes(string text) {
		return Encoding.UTF8.GetByteCount(TextCounter.Normalize(text));
	}
}
