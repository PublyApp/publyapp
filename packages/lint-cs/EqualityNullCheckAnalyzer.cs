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
			_AnalyzeEqualityExpression,
			SyntaxKind.EqualsExpression,
			SyntaxKind.NotEqualsExpression);
	}

	private static void _AnalyzeEqualityExpression(SyntaxNodeAnalysisContext context) {
		if (context.Node is not BinaryExpressionSyntax binaryExpression) {
			return;
		}

		if (!_IsNullLiteral(binaryExpression.Left) && !_IsNullLiteral(binaryExpression.Right)) {
			return;
		}

		if (_IsInsideExpressionTreeLambda(context.SemanticModel, binaryExpression)) {
			return;
		}

		if (_IsInsideIQueryableQueryExpression(context.SemanticModel, binaryExpression)) {
			return;
		}

		var diagnostic = Diagnostic.Create(
			DiagnosticCatalog.EqualityNullCheck,
			binaryExpression.OperatorToken.GetLocation());

		context.ReportDiagnostic(diagnostic);
	}

	private static bool _IsNullLiteral(ExpressionSyntax expression) {
		return expression.IsKind(SyntaxKind.NullLiteralExpression);
	}

	private static bool _IsInsideExpressionTreeLambda(
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

				return _IsExpressionTreeType(convertedType);
			}
		}

		return false;
	}

	/// <summary>
	/// Returns true when the binary expression is syntactically within a LINQ
	/// query-comprehension (<c>QueryExpressionSyntax</c>) whose initial <c>from</c>
	/// clause source is typed as <c>IQueryable</c> or <c>IQueryable&lt;T&gt;</c>.
	/// Those queries lower to expression trees, so <c>is null</c> would be a
	/// CS8122 compile error and must not be flagged.
	/// </summary>
	private static bool _IsInsideIQueryableQueryExpression(
		SemanticModel semanticModel,
		BinaryExpressionSyntax binaryExpression
	) {
		// Walk up to the nearest QueryExpressionSyntax ancestor.
		for (
			SyntaxNode? current = binaryExpression.Parent;
			current is not null;
			current = current.Parent
		) {
			if (current is not QueryExpressionSyntax queryExpression) {
				continue;
			}

			// The root from-clause expression is the IQueryable source.
			var sourceExpression = queryExpression.FromClause.Expression;
			var typeInfo = semanticModel.GetTypeInfo(sourceExpression);
			var sourceType = typeInfo.Type ?? typeInfo.ConvertedType;

			if (_IsIQueryableType(sourceType)) {
				return true;
			}

			// Not IQueryable — keep walking up (nested query inside non-query context).
		}

		return false;
	}

	private static bool _IsIQueryableType(ITypeSymbol? type) {
		if (type is null) {
			return false;
		}

		// Check the type itself and its original definition (handles IQueryable<T>).
		if (_IsIQueryableNamedType(type)) {
			return true;
		}

		// Also check all implemented interfaces (e.g. DbSet<T> implements IQueryable<T>).
		foreach (var iface in type.AllInterfaces) {
			if (_IsIQueryableNamedType(iface)) {
				return true;
			}
		}

		return false;
	}

	private static bool _IsIQueryableNamedType(ITypeSymbol type) {
		if (type is not INamedTypeSymbol named) {
			return false;
		}

		return named.ContainingNamespace.ToDisplayString() == "System.Linq"
			&& named.Name == "IQueryable";
	}

	private static bool _IsExpressionTreeType(ITypeSymbol? type) {
		if (type is not INamedTypeSymbol namedType) {
			return false;
		}

		return namedType.ContainingNamespace.ToDisplayString() == "System.Linq.Expressions"
			&& namedType.Name == "Expression"
			&& (namedType.Arity == 0 || namedType.Arity == 1);
	}
}
