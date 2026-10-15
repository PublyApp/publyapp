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
