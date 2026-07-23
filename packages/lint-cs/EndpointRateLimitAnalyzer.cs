using System.Collections.Immutable;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace PublyApp.Analyzers;

/// <summary>
/// PUBLY0011 — requires every Minimal API endpoint mapping to declare or
/// inherit a named rate-limit policy, carry the explicit global-only marker,
/// or opt out through the reason-bearing helper.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class EndpointRateLimitAnalyzer
	: DiagnosticAnalyzer {
	private static readonly ImmutableHashSet<string>
		EndpointMappingMethods =
			ImmutableHashSet.Create(
				StringComparer.Ordinal,
				"MapGet",
				"MapPost",
				"MapPut",
				"MapPatch",
				"MapDelete",
				"MapMethods",
				"MapFallback",
				"MapHealthChecks",
				"MapOpenApi",
				"MapScalarApiReference"
			);
	private static readonly ImmutableHashSet<string>
		KnownNamedPolicies =
			ImmutableHashSet.Create(
				StringComparer.Ordinal,
				"anonymous-auth-per-ip",
				"anonymous-auth-per-email",
				"password-reset-per-email",
				"anonymous-other",
				"authenticated-default",
				"heavy-search-list",
				"bulk-operation",
				"tenant-bulk-operation",
				"email-operation",
				"tenant-email-operation",
				"export",
				"tenant-export",
				"upload"
			);
	private static readonly ImmutableHashSet<string>
		ApprovedNamedPolicyHelpers =
			ImmutableHashSet.Create(
				StringComparer.Ordinal,
				"RequireAnonymousAuthIpRateLimit",
				"RequireAnonymousAuthEmailRateLimit"
			);

	public override ImmutableArray<DiagnosticDescriptor>
		SupportedDiagnostics {
		get {
			return ImmutableArray.Create(
				DiagnosticCatalog.EndpointRateLimit
			);
		}
	}

	public override void Initialize(
		AnalysisContext context
	) {
		context.ConfigureGeneratedCodeAnalysis(
			GeneratedCodeAnalysisFlags.None
		);
		context.EnableConcurrentExecution();
		context.RegisterSyntaxNodeAction(
			AnalyzeInvocation,
			SyntaxKind.InvocationExpression
		);
	}

	private static void AnalyzeInvocation(
		SyntaxNodeAnalysisContext context
	) {
		if (
			context.Node
				is not InvocationExpressionSyntax invocation
			|| invocation.Expression
				is not MemberAccessExpressionSyntax memberAccess
		) {
			return;
		}

		var methodName =
			memberAccess.Name.Identifier.ValueText;
		if (!EndpointMappingMethods.Contains(methodName)) {
			return;
		}

		var chainRoot = GetFluentChainRoot(invocation);
		if (
			HasDisposition(
				chainRoot,
				context.SemanticModel,
				context.CancellationToken
			)
		) {
			return;
		}

		var visited = new HashSet<ISymbol>(
			SymbolEqualityComparer.Default
		);
		if (
			HasInheritedDisposition(
				memberAccess.Expression,
				context.SemanticModel,
				context.CancellationToken,
				visited
			)
		) {
			return;
		}

		context.ReportDiagnostic(
			Diagnostic.Create(
				DiagnosticCatalog.EndpointRateLimit,
				memberAccess.Name.GetLocation(),
				methodName
			)
		);
	}

	private static bool HasInheritedDisposition(
		ExpressionSyntax receiver,
		SemanticModel semanticModel,
		CancellationToken cancellationToken,
		HashSet<ISymbol> visited
	) {
		if (receiver is not IdentifierNameSyntax identifier) {
			return false;
		}

		var symbol = semanticModel.GetSymbolInfo(
			identifier,
			cancellationToken
		).Symbol;
		if (
			symbol is not ILocalSymbol
			|| !visited.Add(symbol)
		) {
			return false;
		}

		var declarationReference =
			symbol.DeclaringSyntaxReferences
				.FirstOrDefault();
		if (declarationReference is null) {
			return false;
		}

		if (
			declarationReference.GetSyntax(
				cancellationToken
			) is not VariableDeclaratorSyntax declarator
			|| declarator.Initializer?.Value
				is not ExpressionSyntax initializer
		) {
			return false;
		}

		if (
			HasDisposition(
				initializer,
				semanticModel,
				cancellationToken
			)
		) {
			return true;
		}

		var mapGroup = initializer
			.DescendantNodesAndSelf()
			.OfType<InvocationExpressionSyntax>()
			.FirstOrDefault(candidate =>
				GetInvokedMethodName(candidate)
					== "MapGroup"
			);
		if (
			mapGroup?.Expression
				is not MemberAccessExpressionSyntax
					mapGroupAccess
		) {
			return false;
		}

		return HasInheritedDisposition(
			mapGroupAccess.Expression,
			semanticModel,
			cancellationToken,
			visited
		);
	}

	private static bool HasDisposition(
		SyntaxNode root,
		SemanticModel semanticModel,
		CancellationToken cancellationToken
	) {
		foreach (
			var invocation in root
				.DescendantNodesAndSelf()
				.OfType<InvocationExpressionSyntax>()
		) {
			var methodName =
				GetInvokedMethodName(invocation);
			if (
				IsNamedPolicyInvocation(
					invocation,
					methodName,
					semanticModel,
					cancellationToken
				)
			) {
				return true;
			}

			if (
				methodName
					== "WithGlobalRateLimitOnly"
			) {
				return true;
			}

			if (
				methodName
					== "WithRateLimitOptOut"
				&& HasNonEmptyConstantReason(
					invocation,
					semanticModel,
					cancellationToken
				)
			) {
				return true;
			}
		}

		return false;
	}

	private static bool IsNamedPolicyInvocation(
		InvocationExpressionSyntax invocation,
		string? methodName,
		SemanticModel semanticModel,
		CancellationToken cancellationToken
	) {
		if (
			methodName is not null
			&& ApprovedNamedPolicyHelpers.Contains(methodName)
		) {
			return true;
		}

		if (methodName != "RequireRateLimiting") {
			return false;
		}

		var argument = invocation.ArgumentList
			.Arguments
			.FirstOrDefault();
		if (argument is null) {
			return false;
		}

		var constant = semanticModel.GetConstantValue(
			argument.Expression,
			cancellationToken
		);
		return constant.HasValue
			&& constant.Value is string policyName
			&& KnownNamedPolicies.Contains(policyName);
	}

	private static bool HasNonEmptyConstantReason(
		InvocationExpressionSyntax invocation,
		SemanticModel semanticModel,
		CancellationToken cancellationToken
	) {
		var argument = invocation.ArgumentList
			.Arguments
			.FirstOrDefault();
		if (argument is null) {
			return false;
		}

		var constant = semanticModel.GetConstantValue(
			argument.Expression,
			cancellationToken
		);
		return constant.HasValue
			&& constant.Value is string reason
			&& !string.IsNullOrWhiteSpace(reason);
	}

	private static SyntaxNode GetFluentChainRoot(
		InvocationExpressionSyntax invocation
	) {
		SyntaxNode root = invocation;
		while (
			root.Parent
				is MemberAccessExpressionSyntax
					memberAccess
			&& memberAccess.Expression == root
		) {
			root = memberAccess;
			if (
				root.Parent
					is InvocationExpressionSyntax
						parentInvocation
				&& parentInvocation.Expression == root
			) {
				root = parentInvocation;
				continue;
			}
		}

		return root;
	}

	private static string? GetInvokedMethodName(
		InvocationExpressionSyntax invocation
	) {
		if (
			invocation.Expression
				is MemberAccessExpressionSyntax memberAccess
		) {
			return memberAccess.Name.Identifier.ValueText;
		}

		if (
			invocation.Expression
				is IdentifierNameSyntax identifier
		) {
			return identifier.Identifier.ValueText;
		}

		return null;
	}
}
