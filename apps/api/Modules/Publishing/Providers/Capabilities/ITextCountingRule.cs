using System.Text.RegularExpressions;

using PublyApp.Api.Modules.Publishing.Lib;

namespace PublyApp.Api.Modules.Publishing.Providers.Capabilities;

/// <summary>
/// A named way of measuring post text against a limit (issue #2173). A provider
/// lists one <see cref="TextLimit"/> per rule it enforces; validation and the
/// composer iterate them and never branch on the provider. A rule's
/// <see cref="Unit"/> is also its wire name: the browser counts the same unit.
/// </summary>
public interface ITextCountingRule {
	string Unit { get; }

	/// <summary>
	/// The fixed length each URL counts as, for a rule that weights URLs (the
	/// browser needs it to count the same way); null for a rule that does not.
	/// </summary>
	int? UrlWeight {
		get { return null; }
	}

	/// <summary>Measures text that is already normalised.</summary>
	int Count(string normalized);
}

/// <summary>One enforced text limit: a counting rule and its maximum.</summary>
public sealed record TextLimit(ITextCountingRule Rule, int Max);

/// <summary>Extended grapheme clusters (Bluesky's visible limit).</summary>
public sealed class GraphemeCountingRule : ITextCountingRule {
	public static readonly GraphemeCountingRule Instance = new();

	public string Unit {
		get { return "graphemes"; }
	}

	public int Count(string normalized) {
		return TextCounter.CountGraphemes(normalized);
	}
}

/// <summary>UTF-8 bytes (the AT Protocol caps the same text in bytes too).</summary>
public sealed class ByteCountingRule : ITextCountingRule {
	public static readonly ByteCountingRule Instance = new();

	public string Unit {
		get { return "bytes"; }
	}

	public int Count(string normalized) {
		return TextCounter.CountBytes(normalized);
	}
}

/// <summary>
/// Mastodon's visible limit (issue #2174): Unicode code points where every URL
/// counts as <see cref="UrlLength"/> (the instance's
/// <c>characters_reserved_per_url</c>, 23 by default) however long it is, and a
/// remote mention <c>@user@host</c> counts only <c>@user</c>. The browser mirrors
/// the exact patterns below (<c>text-counter.ts</c>); both run the shared
/// <c>text-counter-fixtures.json</c>. ASCII-only classes keep the two regex
/// engines identical.
/// </summary>
public sealed partial class MastodonCountingRule : ITextCountingRule {
	public const int DefaultUrlLength = 23;

	public static readonly MastodonCountingRule Default = new(MastodonCountingRule.DefaultUrlLength);

	public MastodonCountingRule(int urlLength) {
		this.UrlLength = urlLength;
	}

	public int UrlLength { get; }

	public string Unit {
		get { return "characters"; }
	}

	public int? UrlWeight {
		get { return this.UrlLength; }
	}

	public int Count(string normalized) {
		var withoutMentionHosts = MastodonCountingRule._MentionPattern().Replace(normalized, "@$1");
		var urls = 0;
		var rest = MastodonCountingRule._UrlPattern().Replace(withoutMentionHosts, _ => {
			urls += 1;
			return string.Empty;
		});
		return rest.EnumerateRunes().Count() + (urls * this.UrlLength);
	}

	// http(s):// then a run of RFC 3986 URL characters (ASCII only), ending on a
	// character that is not trailing punctuation. Any whitespace (NBSP, U+3000
	// included), CJK or other non-URL character ends the URL, so text glued to a
	// URL is counted as text, never absorbed into the 23.
	[GeneratedRegex("https?://[A-Za-z0-9\\-._~:/?#\\[\\]@!$&'()*+,;=%]*[A-Za-z0-9\\-_~/#@$&*+=%(\\[]")]
	private static partial Regex _UrlPattern();

	[GeneratedRegex("(?<![A-Za-z0-9_/=])@([A-Za-z0-9_]+)@[A-Za-z0-9.-]*[A-Za-z0-9]")]
	private static partial Regex _MentionPattern();
}
