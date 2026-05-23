using Microsoft.CodeAnalysis;

namespace PublyApp.Analyzers;

public static class DiagnosticCatalog {
	public static readonly DiagnosticDescriptor Placeholder = new(
		DiagnosticIds.PUBLY0001,
		"Placeholder rule",
		"Placeholder: {0}",
		"PublyApp",
		DiagnosticSeverity.Warning,
		isEnabledByDefault: false);
}
