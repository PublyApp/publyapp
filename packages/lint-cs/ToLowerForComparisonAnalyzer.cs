using System.Collections.Immutable;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace PublyApp.Analyzers;

/// <summary>
/// PUBLY0003 - flags ToLower()/ToLowerInvariant() when the lowered value is used for
/// comparison or dispatch. Prefer StringComparison overloads or case-insensitive comparers.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class ToLowerForComparisonAnalyzer : DiagnosticAnalyzer {
	public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics {
		get { return ImmutableArray.Create(DiagnosticCatalog.ToLowerForComparison); }
	}

	public override void Initialize(AnalysisContext context) {
		context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
		context.EnableConcurrentExecution();
		context.RegisterSyntaxNodeAction(AnalyzeInvocation, SyntaxKind.InvocationExpression);
	}

	private static void AnalyzeInvocation(SyntaxNodeAnalysisContext context) {
		if (context.Node is not InvocationExpressionSyntax invocation) {
			return;
		}

		if (!IsToLowerInvocation(invocation)) {
			return;
		}

		if (!IsComparisonOrDispatchContext(invocation)) {
			return;
		}

		var diagnostic = Diagnostic.Create(
			DiagnosticCatalog.ToLowerForComparison,
			GetMethodNameLocation(invocation));

		context.ReportDiagnostic(diagnostic);
	}

	private static bool IsToLowerInvocation(InvocationExpressionSyntax invocation) {
		if (invocation.ArgumentList.Arguments.Count != 0) {
			return false;
		}

		var name = GetInvocationName(invocation);

		return string.Equals(name, "ToLower", StringComparison.Ordinal)
			|| string.Equals(name, "ToLowerInvariant", StringComparison.Ordinal);
	}

	private static string? GetInvocationName(InvocationExpressionSyntax invocation) {
		var nameSyntax = GetInvocationNameSyntax(invocation);
		if (nameSyntax is null) {
			return null;
		}

		return nameSyntax.Identifier.ValueText;
	}

	private static SimpleNameSyntax? GetInvocationNameSyntax(InvocationExpressionSyntax invocation) {
		if (invocation.Expression is MemberAccessExpressionSyntax memberAccess) {
			return memberAccess.Name;
		}

		if (invocation.Expression is MemberBindingExpressionSyntax memberBinding) {
			return memberBinding.Name;
		}

		return null;
	}

	private static Location GetMethodNameLocation(InvocationExpressionSyntax invocation) {
		var nameSyntax = GetInvocationNameSyntax(invocation);
		if (nameSyntax is null) {
			return invocation.GetLocation();
		}

		return nameSyntax.GetLocation();
	}

	private static bool IsComparisonOrDispatchContext(InvocationExpressionSyntax invocation) {
		for (SyntaxNode? ancestor = invocation.Parent; ancestor is not null; ancestor = ancestor.Parent) {
			if (ancestor is BinaryExpressionSyntax binaryExpression
				&& IsEqualityBinary(binaryExpression)
				&& ContainsNode(binaryExpression, invocation)) {
				return true;
			}

			if (ancestor is InvocationExpressionSyntax parentInvocation
				&& IsComparisonInvocation(parentInvocation)
				&& ContainsNode(parentInvocation, invocation)) {
				return true;
			}

			if (ancestor is InvocationExpressionSyntax dictionaryInvocation
				&& IsDictionaryKeyLookupInvocation(dictionaryInvocation)
				&& ArgumentsContainNode(dictionaryInvocation, invocation)) {
				return true;
			}

			if (ancestor is ElementAccessExpressionSyntax elementAccess
				&& ContainsNode(elementAccess.ArgumentList, invocation)) {
				return true;
			}

			if (ancestor is SwitchStatementSyntax switchStatement
				&& ContainsNode(switchStatement.Expression, invocation)) {
				return true;
			}

			if (ancestor is SwitchExpressionSyntax switchExpression
				&& ContainsNode(switchExpression.GoverningExpression, invocation)) {
				return true;
			}
		}

		return false;
	}

	private static bool IsEqualityBinary(BinaryExpressionSyntax binaryExpression) {
		return binaryExpression.IsKind(SyntaxKind.EqualsExpression)
			|| binaryExpression.IsKind(SyntaxKind.NotEqualsExpression);
	}

	private static bool IsComparisonInvocation(InvocationExpressionSyntax invocation) {
		var name = GetInvocationName(invocation);

		return string.Equals(name, "Equals", StringComparison.Ordinal)
			|| string.Equals(name, "Contains", StringComparison.Ordinal)
			|| string.Equals(name, "StartsWith", StringComparison.Ordinal)
			|| string.Equals(name, "EndsWith", StringComparison.Ordinal)
			|| string.Equals(name, "IndexOf", StringComparison.Ordinal);
	}

	private static bool IsDictionaryKeyLookupInvocation(InvocationExpressionSyntax invocation) {
		var name = GetInvocationName(invocation);

		return string.Equals(name, "ContainsKey", StringComparison.Ordinal)
			|| string.Equals(name, "TryGetValue", StringComparison.Ordinal)
			|| string.Equals(name, "GetValueOrDefault", StringComparison.Ordinal);
	}

	private static bool ArgumentsContainNode(
		InvocationExpressionSyntax invocation,
		SyntaxNode candidate
	) {
		return ContainsNode(invocation.ArgumentList, candidate);
	}

	private static bool ContainsNode(SyntaxNode container, SyntaxNode candidate) {
		return candidate.SpanStart >= container.SpanStart
			&& candidate.Span.End <= container.Span.End;
	}
}
