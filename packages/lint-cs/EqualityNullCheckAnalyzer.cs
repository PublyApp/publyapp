using System.Collections.Immutable;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace PublyApp.Analyzers;

/// <summary>
/// PUBLY0008 — flags direct equality null checks like <c>x == null</c> so the codebase
/// uses pattern-matching null checks like <c>x is null</c> instead.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class EqualityNullCheckAnalyzer : DiagnosticAnalyzer {
	public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics {
		get { return ImmutableArray.Create(DiagnosticCatalog.EqualityNullCheck); }
	}

	public override void Initialize(AnalysisContext context) {
		context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
		context.EnableConcurrentExecution();
		context.RegisterSyntaxNodeAction(
			AnalyzeEqualityExpression,
			SyntaxKind.EqualsExpression,
			SyntaxKind.NotEqualsExpression);
	}

	private static void AnalyzeEqualityExpression(SyntaxNodeAnalysisContext context) {
		if (context.Node is not BinaryExpressionSyntax binaryExpression) {
			return;
		}

		if (!IsNullLiteral(binaryExpression.Left) && !IsNullLiteral(binaryExpression.Right)) {
			return;
		}

		if (IsInsideExpressionTreeLambda(context.SemanticModel, binaryExpression)) {
			return;
		}

		var diagnostic = Diagnostic.Create(
			DiagnosticCatalog.EqualityNullCheck,
			binaryExpression.OperatorToken.GetLocation());

		context.ReportDiagnostic(diagnostic);
	}

	private static bool IsNullLiteral(ExpressionSyntax expression) {
		return expression.IsKind(SyntaxKind.NullLiteralExpression);
	}

	private static bool IsInsideExpressionTreeLambda(
		SemanticModel semanticModel,
		BinaryExpressionSyntax binaryExpression
	) {
		for (
			SyntaxNode? current = binaryExpression.Parent;
			current is not null;
			current = current.Parent
		) {
			if (current is SimpleLambdaExpressionSyntax or ParenthesizedLambdaExpressionSyntax) {
				var convertedType = semanticModel.GetTypeInfo(current).ConvertedType;

				return IsExpressionTreeType(convertedType);
			}
		}

		return false;
	}

	private static bool IsExpressionTreeType(ITypeSymbol? type) {
		if (type is not INamedTypeSymbol namedType) {
			return false;
		}

		return namedType.ContainingNamespace.ToDisplayString() == "System.Linq.Expressions"
			&& namedType.Name == "Expression"
			&& (namedType.Arity == 0 || namedType.Arity == 1);
	}
}
