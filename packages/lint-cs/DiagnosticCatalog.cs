using Microsoft.CodeAnalysis;

namespace PublyApp.Analyzers;

/// <summary>
/// Central registry for all <see cref="DiagnosticDescriptor"/> instances in this analyzer package.
/// One static field per rule keeps descriptor allocation at module-init time and makes it easy to
/// scan all rules at a glance.
/// </summary>
public static class DiagnosticCatalog {
	/// <summary>
	/// Scaffold-only placeholder rule. <c>isEnabledByDefault: false</c> means Roslyn will load the
	/// analyzer and register the action, but will never surface a diagnostic — this proves the
	/// analyzer wires into the build without imposing any enforcement until a real rule is ready.
	/// </summary>
	public static readonly DiagnosticDescriptor Placeholder = new(
		DiagnosticIds.PUBLY0001,
		"Placeholder rule",
		"Placeholder: {0}",
		"PublyApp",
		DiagnosticSeverity.Warning,
		isEnabledByDefault: false);
}
