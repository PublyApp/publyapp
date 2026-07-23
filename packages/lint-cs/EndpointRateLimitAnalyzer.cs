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
		if (
			!IsEndpointMapping(
				invocation,
				memberAccess,
				context
			)
		) {
			return;
		}

		var chainRoot = GetFluentChainRoot(invocation);
		var capturedInvocations =
			GetCapturedEndpointInvocations(
				chainRoot,
				context.SemanticModel,
				context.CancellationToken
			);
		if (
			(
				HasDisableRateLimiting(chainRoot)
				|| capturedInvocations.Any(
					candidate =>
						GetInvokedMethodName(candidate)
							== "DisableRateLimiting"
				)
			)
			&& !(
				HasReasonedOptOut(
					chainRoot,
					context.SemanticModel,
					context.CancellationToken
				)
				|| HasReasonedOptOut(
					capturedInvocations,
					context.SemanticModel,
					context.CancellationToken
				)
			)
		) {
			context.ReportDiagnostic(
				Diagnostic.Create(
					DiagnosticCatalog.EndpointRateLimit,
					memberAccess.Name.GetLocation(),
					methodName
				)
			);
			return;
		}

		if (
			HasDisposition(
				chainRoot,
				context.SemanticModel,
				context.CancellationToken
			)
			|| HasDisposition(
				capturedInvocations,
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

	private static bool IsEndpointMapping(
		InvocationExpressionSyntax invocation,
		MemberAccessExpressionSyntax memberAccess,
		SyntaxNodeAnalysisContext context
	) {
		var routeBuilderType = context.Compilation
			.GetTypeByMetadataName(
				"Microsoft.AspNetCore.Routing."
					+ "IEndpointRouteBuilder"
			);
		var conventionBuilderType = context.Compilation
			.GetTypeByMetadataName(
				"Microsoft.AspNetCore.Builder."
					+ "IEndpointConventionBuilder"
			);
		if (
			routeBuilderType is null
			|| conventionBuilderType is null
		) {
			return false;
		}

		var receiverType = context.SemanticModel
			.GetTypeInfo(
				memberAccess.Expression,
				context.CancellationToken
			).Type;
		var method = context.SemanticModel
			.GetSymbolInfo(
				invocation,
				context.CancellationToken
			).Symbol as IMethodSymbol;
		if (
			receiverType is null
			|| method is null
			|| !method.Name.StartsWith(
				"Map",
				StringComparison.Ordinal
			)
			|| !IsOrImplements(
				receiverType,
				routeBuilderType
			)
			|| !IsOrImplements(
				method.ReturnType,
				conventionBuilderType
			)
		) {
			return false;
		}

		var routeGroupBuilderType = context.Compilation
			.GetTypeByMetadataName(
				"Microsoft.AspNetCore.Builder."
					+ "RouteGroupBuilder"
			);
		return !IsNonTerminalMapping(
			method,
			routeBuilderType,
			conventionBuilderType,
			routeGroupBuilderType,
			context.CancellationToken
		);
	}

	private static bool IsNonTerminalMapping(
		IMethodSymbol method,
		INamedTypeSymbol routeBuilderType,
		INamedTypeSymbol conventionBuilderType,
		INamedTypeSymbol? routeGroupBuilderType,
		CancellationToken cancellationToken
	) {
		if (
			routeGroupBuilderType is not null
			&& SymbolEqualityComparer.Default.Equals(
				method.ReturnType,
				routeGroupBuilderType
			)
		) {
			return true;
		}

		if (
			method.ReturnType.TypeKind == TypeKind.Interface
			&& (
				IsOrImplements(
					method.ReturnType,
					routeBuilderType
				)
				|| IsOrImplements(
					method.ReturnType,
					conventionBuilderType
				)
			)
		) {
			return true;
		}

		return method.DeclaringSyntaxReferences.Any(
			reference =>
				reference.GetSyntax(cancellationToken)
					is MethodDeclarationSyntax declaration
				&& ReturnsMapGroup(declaration)
		);
	}

	private static bool ReturnsMapGroup(
		MethodDeclarationSyntax declaration
	) {
		if (
			declaration.ExpressionBody?.Expression
				is ExpressionSyntax expression
		) {
			return IsMapGroupInvocation(expression);
		}

		return declaration.Body?.Statements
			.OfType<ReturnStatementSyntax>()
			.Any(statement =>
				statement.Expression is not null
				&& IsMapGroupInvocation(
					statement.Expression
				)
			) == true;
	}

	private static bool IsMapGroupInvocation(
		ExpressionSyntax expression
	) {
		while (
			expression
				is ParenthesizedExpressionSyntax parenthesized
		) {
			expression = parenthesized.Expression;
		}

		return expression
				is InvocationExpressionSyntax invocation
			&& GetInvokedMethodName(invocation)
				== "MapGroup";
	}

	private static bool IsOrImplements(
		ITypeSymbol type,
		INamedTypeSymbol target
	) {
		return SymbolEqualityComparer.Default.Equals(
				type,
				target
			)
			|| type.AllInterfaces.Any(candidate =>
				SymbolEqualityComparer.Default.Equals(
					candidate,
					target
				)
			);
	}

	private static IReadOnlyList<
		InvocationExpressionSyntax
	> GetCapturedEndpointInvocations(
		SyntaxNode chainRoot,
		SemanticModel semanticModel,
		CancellationToken cancellationToken
	) {
		if (
			chainRoot.Parent
				is not EqualsValueClauseSyntax {
					Parent: VariableDeclaratorSyntax
						declarator,
				}
			|| semanticModel.GetDeclaredSymbol(
				declarator,
				cancellationToken
			) is not ILocalSymbol endpointLocal
		) {
			return [];
		}

		return chainRoot.SyntaxTree
			.GetRoot(cancellationToken)
			.DescendantNodes()
			.OfType<InvocationExpressionSyntax>()
			.Where(candidate =>
				candidate.Expression
					is MemberAccessExpressionSyntax {
						Expression:
							IdentifierNameSyntax identifier,
					}
				&& SymbolEqualityComparer.Default.Equals(
					semanticModel.GetSymbolInfo(
						identifier,
						cancellationToken
					).Symbol,
					endpointLocal
				)
			)
			.ToArray();
	}

	private static bool HasDisableRateLimiting(
		SyntaxNode root
	) {
		return root
			.DescendantNodesAndSelf()
			.OfType<InvocationExpressionSyntax>()
			.Any(invocation =>
				GetInvokedMethodName(invocation)
					== "DisableRateLimiting"
			);
	}

	private static bool HasReasonedOptOut(
		SyntaxNode root,
		SemanticModel semanticModel,
		CancellationToken cancellationToken
	) {
		return HasReasonedOptOut(
			root.DescendantNodesAndSelf()
				.OfType<InvocationExpressionSyntax>(),
			semanticModel,
			cancellationToken
		);
	}

	private static bool HasReasonedOptOut(
		IEnumerable<InvocationExpressionSyntax>
			invocations,
		SemanticModel semanticModel,
		CancellationToken cancellationToken
	) {
		return invocations
			.Any(invocation =>
				GetInvokedMethodName(invocation)
					== "WithRateLimitOptOut"
				&& HasNonEmptyConstantReason(
					invocation,
					semanticModel,
					cancellationToken
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
		return HasDisposition(
			root.DescendantNodesAndSelf()
				.OfType<InvocationExpressionSyntax>(),
			semanticModel,
			cancellationToken
		);
	}

	private static bool HasDisposition(
		IEnumerable<InvocationExpressionSyntax>
			invocations,
		SemanticModel semanticModel,
		CancellationToken cancellationToken
	) {
		foreach (
			var invocation in invocations
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
