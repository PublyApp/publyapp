using System.Globalization;
using System.Text;

namespace PublyApp.Api.Modules.Publishing.Lib;

/// <summary>
/// Counts post text the way providers do (issue #2169). The browser counterpart
/// (<c>Intl.Segmenter</c>, apps/front text-counter) must agree on every string in
/// the shared fixture file <c>text-counter-fixtures.json</c>.
/// </summary>
public static class TextCounter {
	/// <summary>
	/// The text as it is counted AND published: line endings normalised to
	/// <c>\n</c>, trailing whitespace trimmed.
	/// </summary>
	public static string Normalize(string text) {
		return text
			.Replace("\r\n", "\n", StringComparison.Ordinal)
			.Replace('\r', '\n')
			.TrimEnd();
	}

	/// <summary>Extended grapheme clusters (user-perceived characters).</summary>
	public static int CountGraphemes(string text) {
		return new StringInfo(TextCounter.Normalize(text)).LengthInTextElements;
	}

	public static int CountBytes(string text) {
		return Encoding.UTF8.GetByteCount(TextCounter.Normalize(text));
	}
}
