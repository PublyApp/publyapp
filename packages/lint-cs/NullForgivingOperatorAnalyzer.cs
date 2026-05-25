using System.Collections.Immutable;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace PublyApp.Analyzers;

/// <summary>
/// PUBLY0001 — flags every use of the postfix null-forgiving operator (<c>x!</c>) so production C#
/// handles null explicitly instead of suppressing nullable warnings. Reports at the location of the
/// <c>!</c> token itself.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class NullForgivingOperatorAnalyzer : DiagnosticAnalyzer {
	public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics =>
		ImmutableArray.Create(DiagnosticCatalog.NullForgivingOperator);

	public override void Initialize(AnalysisContext context) {
		// Skip generated code (e.g. Kiota client, EF migrations) to avoid penalizing code the repo
		// does not hand-author.
		context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
		// Required for analyzers that call thread-safe Roslyn APIs; the SDK enforces this when
		// EnforceExtendedAnalyzerRules is enabled.
		context.EnableConcurrentExecution();
		// The postfix `x!` parses to a SuppressNullableWarningExpression node.
		context.RegisterSyntaxNodeAction(
			AnalyzeSuppressNullableWarning,
			SyntaxKind.SuppressNullableWarningExpression);
	}

	private static void AnalyzeSuppressNullableWarning(SyntaxNodeAnalysisContext context) {
		if (context.Node is not PostfixUnaryExpressionSyntax postfix) {
			return;
		}

		// Report on the `!` operator token so the squiggle lands on the operator, not the operand.
		var diagnostic = Diagnostic.Create(
			DiagnosticCatalog.NullForgivingOperator,
			postfix.OperatorToken.GetLocation());

		context.ReportDiagnostic(diagnostic);
	}
}
