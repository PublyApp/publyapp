using Microsoft.CodeAnalysis;

namespace PublyApp.Analyzers;

/// <summary>
/// Central registry for all <see cref="DiagnosticDescriptor"/> instances in this analyzer package.
/// One static field per rule keeps descriptor allocation at module-init time and makes it easy to
/// scan all rules at a glance.
/// </summary>
public static class DiagnosticCatalog {
	/// <summary>
	/// PUBLY0001 — disallow the null-forgiving operator (<c>x!</c>) in production C#. Per the repo
	/// C# standards, the null state must be handled explicitly (guard clauses or safe accessors like
	/// <c>GetRequiredId()</c>) instead of suppressing the nullable warning. <c>isEnabledByDefault:
	/// false</c> means Roslyn loads the analyzer and registers the action but never surfaces the
	/// diagnostic until it is turned on via <c>.editorconfig</c> — deferred until production code is
	/// clean.
	/// </summary>
	public static readonly DiagnosticDescriptor NullForgivingOperator = new(
		DiagnosticIds.PUBLY0001,
		"Avoid the null-forgiving operator",
		"Do not use the null-forgiving operator '!'; handle null explicitly with a guard clause or "
			+ "a safe accessor",
		"PublyApp.Nullability",
		DiagnosticSeverity.Warning,
		isEnabledByDefault: false,
		description: "The null-forgiving operator '!' suppresses nullable warnings without handling "
			+ "the null state. Use guard clauses or safe accessors (e.g. GetRequiredId()) instead.");

	/// <summary>
	/// PUBLY0002 — disallow null-coalescing throw expressions (<c>x ?? throw ...</c>) in
	/// production C#. Per the repo C# standards, null-then-throw paths must use explicit guard
	/// clauses instead of embedding a throw expression in a coalesce expression.
	/// <c>isEnabledByDefault: false</c> means Roslyn loads the analyzer and registers the action
	/// but never surfaces the diagnostic until it is turned on via <c>.editorconfig</c> — deferred
	/// until production code is clean.
	/// </summary>
	public static readonly DiagnosticDescriptor CoalesceThrow = new(
		DiagnosticIds.PUBLY0002,
		"Avoid null-coalescing throw expressions",
		"Do not use '?? throw'; use an explicit if guard clause for null-then-throw patterns",
		"PublyApp.Nullability",
		DiagnosticSeverity.Warning,
		isEnabledByDefault: false,
		description: "The '?? throw' pattern hides null handling inside an expression. Use "
			+ "explicit guard clauses for null-then-throw patterns instead.");

	/// <summary>
	/// PUBLY0003 - disallow ToLower()/ToLowerInvariant() in comparison or dispatch contexts. Per
	/// the repo C# standards, case-insensitive comparison should use StringComparison overloads or
	/// case-insensitive comparers instead of allocating a normalized string first. Disabled by
	/// default so the analyzer can ship dormant before enforcement is enabled in .editorconfig.
	/// </summary>
	public static readonly DiagnosticDescriptor ToLowerForComparison = new(
		DiagnosticIds.PUBLY0003,
		"Avoid ToLower() for comparison or dispatch",
		"Do not use ToLower()/ToLowerInvariant() for comparison or dispatch; use "
			+ "StringComparison overloads or case-insensitive comparers",
		"PublyApp.Comparison",
		DiagnosticSeverity.Warning,
		isEnabledByDefault: false,
		description: "Calling ToLower()/ToLowerInvariant() before comparison or dispatch can be "
			+ "culture-sensitive, allocate unnecessarily, and hide the intended comparison "
			+ "semantics. Use StringComparison overloads or case-insensitive comparers instead.");
}
