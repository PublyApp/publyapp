namespace PublyApp.Api.Lib.Utils;

/// <summary>
/// Shared helper for building safe <c>EF.Functions.ILike</c> patterns from
/// caller-supplied search text. Every ILIKE search surface in the API must route
/// through <see cref="EscapeLikePattern"/> before interpolating the search term
/// into a <c>%...%</c> pattern — otherwise a literal <c>%</c> or <c>_</c> typed by
/// the caller is interpreted as a wildcard instead of a literal character (e.g.
/// <c>q=%</c> would match every row).
/// </summary>
public static class LikePatternUtils {
	// Passed as the ILIKE ESCAPE argument so an escaped '%'/'_' in the pattern below
	// is matched literally instead of as a wildcard.
	public const string LikeEscapeChar = "\\";

	/// <summary>
	/// Neutralizes ILIKE wildcard metacharacters in caller-supplied search text so
	/// e.g. a literal "%" or "_" in the query only matches that literal character,
	/// not "any run of characters" / "any single character". Must be paired with
	/// <c>EF.Functions.ILike(col, pattern, LikeEscapeChar)</c> — the escape char is
	/// what makes the backslashes inserted here significant to Postgres.
	/// </summary>
	public static string EscapeLikePattern(string value) {
		return value
			.Replace("\\", "\\\\", StringComparison.Ordinal)
			.Replace("%", "\\%", StringComparison.Ordinal)
			.Replace("_", "\\_", StringComparison.Ordinal);
	}
}
