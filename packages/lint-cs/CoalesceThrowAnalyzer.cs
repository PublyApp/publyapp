using System.Collections.Immutable;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace PublyApp.Analyzers;

/// <summary>
/// PUBLY0002 — flags every null-coalescing throw expression (<c>x ?? throw ...</c>) so
/// production C# handles null explicitly with a guard clause. Reports at the location of the
/// <c>??</c> operator itself.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class CoalesceThrowAnalyzer : DiagnosticAnalyzer {
	public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics {
		get { return ImmutableArray.Create(DiagnosticCatalog.CoalesceThrow); }
	}

	public override void Initialize(AnalysisContext context) {
		// Skip generated code (e.g. Kiota client, EF migrations) to avoid penalizing code the repo
		// does not hand-author.
		context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
		// Required for analyzers that call thread-safe Roslyn APIs; the SDK enforces this when
		// EnforceExtendedAnalyzerRules is enabled.
		context.EnableConcurrentExecution();
		// The `x ?? throw ...` pattern parses to a CoalesceExpression with a ThrowExpression on
		// the right-hand side.
		context.RegisterSyntaxNodeAction(AnalyzeCoalesceExpression, SyntaxKind.CoalesceExpression);
	}

	private static void AnalyzeCoalesceExpression(SyntaxNodeAnalysisContext context) {
		if (context.Node is not BinaryExpressionSyntax coalesceExpression) {
			return;
		}

		if (coalesceExpression.Right is not ThrowExpressionSyntax) {
			return;
		}

		// Report on the `??` operator token so the squiggle lands on the operator, not an operand.
		var diagnostic = Diagnostic.Create(
			DiagnosticCatalog.CoalesceThrow,
			coalesceExpression.OperatorToken.GetLocation());

		context.ReportDiagnostic(diagnostic);
	}
}
