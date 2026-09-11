using System.Collections.Immutable;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace PublyApp.Analyzers;

/// <summary>
/// PUBLY0009 — flags <c>TypedResults.Forbid()</c> calls so error responses go through
/// <c>TypedProblems.*</c> (RFC 7807) instead. Matches the <c>Forbid</c> member on the
/// <c>TypedResults</c> type, including the fully-qualified
/// <c>Microsoft.AspNetCore.Http.TypedResults.Forbid</c> form. Reports at the
/// <c>Forbid</c> member name.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class TypedResultsForbidAnalyzer : DiagnosticAnalyzer {
	private const string _TypedResultsTypeName = "TypedResults";
	private const string _ForbidMethodName = "Forbid";

	public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics {
		get { return ImmutableArray.Create(DiagnosticCatalog.TypedResultsForbid); }
	}

	public override void Initialize(AnalysisContext context) {
		// Skip generated code (e.g. Kiota client, EF migrations) to avoid penalizing code the repo
		// does not hand-author.
		context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
		// Required for analyzers that call thread-safe Roslyn APIs; the SDK enforces this when
		// EnforceExtendedAnalyzerRules is enabled.
		context.EnableConcurrentExecution();
		// `TypedResults.Forbid(...)` parses to an InvocationExpression whose expression is a
		// member access naming `Forbid` on the `TypedResults` type.
		context.RegisterSyntaxNodeAction(_AnalyzeInvocation, SyntaxKind.InvocationExpression);
	}

	private static void _AnalyzeInvocation(SyntaxNodeAnalysisContext context) {
		if (context.Node is not InvocationExpressionSyntax invocation) {
			return;
		}

		if (invocation.Expression is not MemberAccessExpressionSyntax memberAccess) {
			return;
		}

		if (!string.Equals(memberAccess.Name.Identifier.ValueText, _ForbidMethodName, StringComparison.Ordinal)) {
			return;
		}

		if (!_IsTypedResultsReceiver(memberAccess.Expression)) {
			return;
		}

		// Report on the `Forbid` member name so the squiggle lands on the offending call.
		var diagnostic = Diagnostic.Create(
			DiagnosticCatalog.TypedResultsForbid,
			memberAccess.Name.GetLocation());

		context.ReportDiagnostic(diagnostic);
	}

	private static bool _IsTypedResultsReceiver(ExpressionSyntax receiver) {
		// `TypedResults.Forbid()` — receiver is the bare type name.
		if (receiver is IdentifierNameSyntax identifier) {
			return string.Equals(
				identifier.Identifier.ValueText,
				_TypedResultsTypeName,
				StringComparison.Ordinal);
		}

		// `Microsoft.AspNetCore.Http.TypedResults.Forbid()` — receiver is a qualified member access
		// whose trailing segment is the `TypedResults` type name.
		if (receiver is MemberAccessExpressionSyntax qualified) {
			return string.Equals(
				qualified.Name.Identifier.ValueText,
				_TypedResultsTypeName,
				StringComparison.Ordinal);
		}

		return false;
	}
}
