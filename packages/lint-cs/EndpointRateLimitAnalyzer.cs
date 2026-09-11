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
	private enum MappingTerminality {
		Undecidable,
		Terminal,
		NonTerminal,
	}

	private const string _AspNetBuilderNamespace =
		"Microsoft.AspNetCore.Builder";
	private const string _RateLimiterExtensionsType =
		"RateLimiterEndpointConventionBuilderExtensions";
	private const string _RateLimitingNamespace =
		"PublyApp.Api.Lib.RateLimiting";
	private const string _ApiRateLimitExtensionsType =
		"ApiRateLimitEndpointExtensions";
	private const string _AnonymousAuthExtensionsType =
		"AnonymousAuthRateLimitExtensions";

	private static readonly ImmutableHashSet<string>
		_KnownNamedPolicies =
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
				"upload",
				// A5 (#636): dedicated staff system-job trigger bucket — produces
				// real job_queue work, never shares another bucket.
				"system-job-trigger"
			);
	private static readonly ImmutableHashSet<string>
		_ApprovedNamedPolicyHelpers =
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
			_AnalyzeInvocation,
			SyntaxKind.InvocationExpression
		);
	}

	private static void _AnalyzeInvocation(
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
			!_IsEndpointMapping(
				invocation,
				memberAccess,
				context
			)
		) {
			return;
		}

		var chainRoot = _GetFluentChainRoot(invocation);
		var capturedInvocations =
			_GetCapturedEndpointInvocations(
				chainRoot,
				context.SemanticModel,
				context.CancellationToken
			);
		if (
			(
				_HasDisableRateLimiting(
					chainRoot,
					context.SemanticModel,
					context.CancellationToken
				)
				|| capturedInvocations.Any(
					candidate =>
						_IsIntendedMethod(
							candidate,
							"DisableRateLimiting",
							_AspNetBuilderNamespace,
							_RateLimiterExtensionsType,
							context.SemanticModel,
							context.CancellationToken
						)
				)
			)
			&& !(
				_HasReasonedOptOut(
					chainRoot,
					context.SemanticModel,
					context.CancellationToken
				)
				|| _HasReasonedOptOut(
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
			_HasDisposition(
				chainRoot,
				context.SemanticModel,
				context.CancellationToken
			)
			|| _HasDisposition(
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
			_HasInheritedDisposition(
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

	private static bool _IsEndpointMapping(
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
		if (
			receiverType is null
			|| context.SemanticModel
			.GetSymbolInfo(
				invocation,
				context.CancellationToken
			).Symbol is not IMethodSymbol method
			|| !method.Name.StartsWith(
				"Map",
				StringComparison.Ordinal
			)
			|| !_IsOrImplements(
				receiverType,
				routeBuilderType
			)
			|| !_IsOrImplements(
				method.ReturnType,
				conventionBuilderType
			)
		) {
			return false;
		}

		var routeGroupBuilderType = context.Compilation
			.GetTypeByMetadataName(
				"Microsoft.AspNetCore.Routing."
					+ "RouteGroupBuilder"
			);
		var routeHandlerBuilderType = context.Compilation
			.GetTypeByMetadataName(
				"Microsoft.AspNetCore.Builder."
					+ "RouteHandlerBuilder"
			);
		var completedTerminalities =
			new Dictionary<ISymbol, MappingTerminality>(
				SymbolEqualityComparer.Default
			);
		return _GetMappingTerminality(
			method,
			routeBuilderType,
			conventionBuilderType,
			routeGroupBuilderType,
			routeHandlerBuilderType,
			context.Compilation,
			context.CancellationToken,
			new HashSet<ISymbol>(
				SymbolEqualityComparer.Default
			),
			completedTerminalities
		) == MappingTerminality.Terminal;
	}

	private static MappingTerminality
		_GetMappingTerminality(
		IMethodSymbol method,
		INamedTypeSymbol routeBuilderType,
		INamedTypeSymbol conventionBuilderType,
		INamedTypeSymbol? routeGroupBuilderType,
		INamedTypeSymbol? routeHandlerBuilderType,
		Compilation compilation,
		CancellationToken cancellationToken,
		HashSet<ISymbol> visited,
		Dictionary<ISymbol, MappingTerminality>
			completedTerminalities
	) {
		var definition = method.OriginalDefinition;
		if (visited.Contains(definition)) {
			return MappingTerminality.Undecidable;
		}

		if (
			completedTerminalities.TryGetValue(
				definition,
				out var completedTerminality
			)
		) {
			return completedTerminality;
		}

		visited.Add(definition);
		if (
			_IsAspNetCoreMappingApi(
				method,
				routeBuilderType,
				conventionBuilderType
			)
		) {
			var frameworkTerminality =
				_ClassifyMappingResultType(
				method.ReturnType,
				routeBuilderType,
				routeGroupBuilderType,
				routeHandlerBuilderType
			);
			completedTerminalities[definition] =
				frameworkTerminality;
			return frameworkTerminality;
		}

		if (method.DeclaringSyntaxReferences.Length == 0) {
			return MappingTerminality.Undecidable;
		}

		MappingTerminality? terminality = null;
		foreach (
			var reference
				in method.DeclaringSyntaxReferences
		) {
			if (
				reference.GetSyntax(cancellationToken)
					is not MethodDeclarationSyntax declaration
			) {
				return MappingTerminality.Undecidable;
			}

#pragma warning disable RS1030
			// Source-visible helpers can be declared in another
			// syntax tree. Their returned mapping symbol cannot
			// be resolved from the call site's semantic model.
			var semanticModel = compilation.GetSemanticModel(
				declaration.SyntaxTree
			);
#pragma warning restore RS1030
			var declarationTerminality =
				_GetDeclarationTerminality(
					declaration,
					semanticModel,
					routeBuilderType,
					conventionBuilderType,
					routeGroupBuilderType,
					routeHandlerBuilderType,
					compilation,
					cancellationToken,
					visited,
					completedTerminalities
				);
			if (
				declarationTerminality
					== MappingTerminality.Undecidable
				|| (
					terminality is not null
					&& terminality.Value
						!= declarationTerminality
				)
			) {
				return MappingTerminality.Undecidable;
			}

			terminality = declarationTerminality;
		}

		var result = terminality
			?? MappingTerminality.Undecidable;
		// Undecidable can depend on this path's active
		// ancestors, so it is not a completed result.
		if (result != MappingTerminality.Undecidable) {
			completedTerminalities[definition] = result;
		}

		return result;
	}

	private static MappingTerminality
		_GetDeclarationTerminality(
		MethodDeclarationSyntax declaration,
		SemanticModel semanticModel,
		INamedTypeSymbol routeBuilderType,
		INamedTypeSymbol conventionBuilderType,
		INamedTypeSymbol? routeGroupBuilderType,
		INamedTypeSymbol? routeHandlerBuilderType,
		Compilation compilation,
		CancellationToken cancellationToken,
		HashSet<ISymbol> visited,
		Dictionary<ISymbol, MappingTerminality>
			completedTerminalities
	) {
		if (
			declaration.ExpressionBody?.Expression
				is ExpressionSyntax expression
		) {
			return _GetExpressionTerminality(
				expression,
				semanticModel,
				routeBuilderType,
				conventionBuilderType,
				routeGroupBuilderType,
				routeHandlerBuilderType,
				compilation,
				cancellationToken,
				visited,
				completedTerminalities
			);
		}

		var returnExpressions = declaration.Body
			?.DescendantNodes(
				node =>
					node
						is not (
							AnonymousFunctionExpressionSyntax
							or LocalFunctionStatementSyntax
						)
			)
			.OfType<ReturnStatementSyntax>()
			.Select(statement => statement.Expression)
			.OfType<ExpressionSyntax>()
			.ToArray();
		if (
			returnExpressions is null
			|| returnExpressions.Length == 0
		) {
			return MappingTerminality.Undecidable;
		}

		MappingTerminality? terminality = null;
		foreach (var returnExpression in returnExpressions) {
			var returnTerminality =
				_GetExpressionTerminality(
					returnExpression,
					semanticModel,
					routeBuilderType,
					conventionBuilderType,
					routeGroupBuilderType,
					routeHandlerBuilderType,
					compilation,
					cancellationToken,
					new HashSet<ISymbol>(
						visited,
						SymbolEqualityComparer.Default
					),
					completedTerminalities
				);
			if (
				returnTerminality
					== MappingTerminality.Undecidable
				|| (
					terminality is not null
					&& terminality.Value
						!= returnTerminality
				)
			) {
				return MappingTerminality.Undecidable;
			}

			terminality = returnTerminality;
		}

		return terminality
			?? MappingTerminality.Undecidable;
	}

	private static MappingTerminality
		_GetExpressionTerminality(
		ExpressionSyntax expression,
		SemanticModel semanticModel,
		INamedTypeSymbol routeBuilderType,
		INamedTypeSymbol conventionBuilderType,
		INamedTypeSymbol? routeGroupBuilderType,
		INamedTypeSymbol? routeHandlerBuilderType,
		Compilation compilation,
		CancellationToken cancellationToken,
		HashSet<ISymbol> visited,
		Dictionary<ISymbol, MappingTerminality>
			completedTerminalities
	) {
		if (
			expression
				is ParenthesizedExpressionSyntax parenthesized
		) {
			return _GetExpressionTerminality(
				parenthesized.Expression,
				semanticModel,
				routeBuilderType,
				conventionBuilderType,
				routeGroupBuilderType,
				routeHandlerBuilderType,
				compilation,
				cancellationToken,
				visited,
				completedTerminalities
			);
		}

		if (expression is CastExpressionSyntax cast) {
			return _GetExpressionTerminality(
				cast.Expression,
				semanticModel,
				routeBuilderType,
				conventionBuilderType,
				routeGroupBuilderType,
				routeHandlerBuilderType,
				compilation,
				cancellationToken,
				visited,
				completedTerminalities
			);
		}

		if (
			expression
				is IdentifierNameSyntax identifier
			&& semanticModel.GetSymbolInfo(
				identifier,
				cancellationToken
			).Symbol is ILocalSymbol local
			&& local.DeclaringSyntaxReferences
				.FirstOrDefault()
				?.GetSyntax(cancellationToken)
				is VariableDeclaratorSyntax {
					Initializer.Value:
						ExpressionSyntax initializer,
				}
		) {
			return _GetExpressionTerminality(
				initializer,
				semanticModel,
				routeBuilderType,
				conventionBuilderType,
				routeGroupBuilderType,
				routeHandlerBuilderType,
				compilation,
				cancellationToken,
				visited,
				completedTerminalities
			);
		}

		if (
			expression
				is not InvocationExpressionSyntax invocation
			|| semanticModel.GetSymbolInfo(
				invocation,
				cancellationToken
			).Symbol is not IMethodSymbol method
		) {
			return MappingTerminality.Undecidable;
		}

		if (
			_IsAspNetCoreMappingApi(
				method,
				routeBuilderType,
				conventionBuilderType
			)
		) {
			return _ClassifyMappingResultType(
				method.ReturnType,
				routeBuilderType,
				routeGroupBuilderType,
				routeHandlerBuilderType
			);
		}

		if (
			_IsMappingMethodCandidate(
				method,
				routeBuilderType,
				conventionBuilderType
			)
		) {
			return _GetMappingTerminality(
				method,
				routeBuilderType,
				conventionBuilderType,
				routeGroupBuilderType,
				routeHandlerBuilderType,
				compilation,
				cancellationToken,
				visited,
				completedTerminalities
			);
		}

		if (
			invocation.Expression
				is MemberAccessExpressionSyntax memberAccess
		) {
			return _GetExpressionTerminality(
				memberAccess.Expression,
				semanticModel,
				routeBuilderType,
				conventionBuilderType,
				routeGroupBuilderType,
				routeHandlerBuilderType,
				compilation,
				cancellationToken,
				visited,
				completedTerminalities
			);
		}

		return MappingTerminality.Undecidable;
	}

	private static bool _IsMappingMethodCandidate(
		IMethodSymbol method,
		INamedTypeSymbol routeBuilderType,
		INamedTypeSymbol conventionBuilderType
	) {
		return method.Name.StartsWith(
				"Map",
				StringComparison.Ordinal
			)
			&& _IsOrImplements(
				_GetMappingReceiverType(method),
				routeBuilderType
			)
			&& _IsOrImplements(
				method.ReturnType,
				conventionBuilderType
			);
	}

	private static bool _IsAspNetCoreMappingApi(
		IMethodSymbol method,
		INamedTypeSymbol routeBuilderType,
		INamedTypeSymbol conventionBuilderType
	) {
		var definition = method.ReducedFrom
			?? method;
		var assemblyName =
			definition.ContainingAssembly?.Name;
		var isFrameworkSymbol =
			assemblyName?.StartsWith(
				"Microsoft.AspNetCore.",
				StringComparison.Ordinal
			) == true
			|| (
				definition.ContainingType.Name
					== "EndpointRouteBuilderExtensions"
				&& definition.ContainingNamespace
					.ToDisplayString()
					== "Microsoft.AspNetCore.Builder"
			);

		return isFrameworkSymbol
			&& _IsMappingMethodCandidate(
				method,
				routeBuilderType,
				conventionBuilderType
			);
	}

	private static ITypeSymbol _GetMappingReceiverType(
		IMethodSymbol method
	) {
		var definition = method.ReducedFrom
			?? method;
		if (
			definition.IsExtensionMethod
			&& definition.Parameters.Length > 0
		) {
			return definition.Parameters[0].Type;
		}

		return method.ReceiverType
			?? method.ContainingType;
	}

	private static MappingTerminality
		_ClassifyMappingResultType(
		ITypeSymbol returnType,
		INamedTypeSymbol routeBuilderType,
		INamedTypeSymbol? routeGroupBuilderType,
		INamedTypeSymbol? routeHandlerBuilderType
	) {
		if (
			routeGroupBuilderType is not null
			&& SymbolEqualityComparer.Default.Equals(
				returnType,
				routeGroupBuilderType
			)
		) {
			return MappingTerminality.NonTerminal;
		}

		if (
			routeHandlerBuilderType is not null
			&& SymbolEqualityComparer.Default.Equals(
				returnType,
				routeHandlerBuilderType
			)
		) {
			return MappingTerminality.Terminal;
		}

		return _IsOrImplements(
			returnType,
			routeBuilderType
		)
			? MappingTerminality.NonTerminal
			: MappingTerminality.Terminal;
	}

	private static bool _IsOrImplements(
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
	> _GetCapturedEndpointInvocations(
		SyntaxNode chainRoot,
		SemanticModel semanticModel,
		CancellationToken cancellationToken
		) {
		var conventionBuilderType = semanticModel
			.Compilation
			.GetTypeByMetadataName(
				"Microsoft.AspNetCore.Builder."
					+ "IEndpointConventionBuilder"
			);
		if (
			conventionBuilderType is null
			|| chainRoot.Parent
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
				_IsEndpointConventionChainRootedInLocal(
					candidate,
					endpointLocal,
					conventionBuilderType,
					semanticModel,
					cancellationToken
				)
			)
			.ToArray();
	}

	private static bool
		_IsEndpointConventionChainRootedInLocal(
		InvocationExpressionSyntax invocation,
		ILocalSymbol endpointLocal,
		INamedTypeSymbol conventionBuilderType,
		SemanticModel semanticModel,
		CancellationToken cancellationToken
	) {
		if (
			invocation.Expression
				is not MemberAccessExpressionSyntax memberAccess
			|| semanticModel.GetTypeInfo(
				invocation,
				cancellationToken
			).Type is not ITypeSymbol resultType
			|| !_IsOrImplements(
				resultType,
				conventionBuilderType
			)
		) {
			return false;
		}

		ExpressionSyntax receiver =
			memberAccess.Expression;
		while (true) {
			var receiverType = semanticModel
				.GetTypeInfo(
					receiver,
					cancellationToken
				).Type;
			if (
				receiverType is null
				|| !_IsOrImplements(
					receiverType,
					conventionBuilderType
				)
			) {
				return false;
			}

			if (
				receiver
					is ParenthesizedExpressionSyntax
						parenthesized
			) {
				receiver = parenthesized.Expression;
				continue;
			}

			if (
				receiver
					is InvocationExpressionSyntax {
						Expression:
							MemberAccessExpressionSyntax
								previousAccess,
					}
			) {
				receiver = previousAccess.Expression;
				continue;
			}

			return receiver
					is IdentifierNameSyntax identifier
				&& SymbolEqualityComparer.Default.Equals(
					semanticModel.GetSymbolInfo(
						identifier,
						cancellationToken
					).Symbol,
					endpointLocal
				);
		}
	}

	private static bool _HasDisableRateLimiting(
		SyntaxNode root,
		SemanticModel semanticModel,
		CancellationToken cancellationToken
	) {
		return root
			.DescendantNodesAndSelf()
			.OfType<InvocationExpressionSyntax>()
			.Any(invocation =>
				_IsIntendedMethod(
					invocation,
					"DisableRateLimiting",
					_AspNetBuilderNamespace,
					_RateLimiterExtensionsType,
					semanticModel,
					cancellationToken
				)
			);
	}

	private static bool _HasReasonedOptOut(
		SyntaxNode root,
		SemanticModel semanticModel,
		CancellationToken cancellationToken
	) {
		return _HasReasonedOptOut(
			root.DescendantNodesAndSelf()
				.OfType<InvocationExpressionSyntax>(),
			semanticModel,
			cancellationToken
		);
	}

	private static bool _HasReasonedOptOut(
		IEnumerable<InvocationExpressionSyntax>
			invocations,
		SemanticModel semanticModel,
		CancellationToken cancellationToken
		) {
		return invocations
			.Any(invocation =>
				_IsIntendedMethod(
					invocation,
					"WithRateLimitOptOut",
					_RateLimitingNamespace,
					_ApiRateLimitExtensionsType,
					semanticModel,
					cancellationToken
				)
				&& _HasNonEmptyConstantReason(
					invocation,
					semanticModel,
					cancellationToken
				)
			);
	}

	private static bool _HasInheritedDisposition(
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
			_HasDisposition(
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
				_GetInvokedMethodName(candidate)
					== "MapGroup"
			);
		if (
			mapGroup?.Expression
				is not MemberAccessExpressionSyntax
					mapGroupAccess
		) {
			return false;
		}

		return _HasInheritedDisposition(
			mapGroupAccess.Expression,
			semanticModel,
			cancellationToken,
			visited
		);
	}

	private static bool _HasDisposition(
		SyntaxNode root,
		SemanticModel semanticModel,
		CancellationToken cancellationToken
	) {
		return _HasDisposition(
			root.DescendantNodesAndSelf()
				.OfType<InvocationExpressionSyntax>(),
			semanticModel,
			cancellationToken
		);
	}

	private static bool _HasDisposition(
		IEnumerable<InvocationExpressionSyntax>
			invocations,
		SemanticModel semanticModel,
		CancellationToken cancellationToken
		) {
		foreach (
			var invocation in invocations
		) {
			if (
				_IsNamedPolicyInvocation(
					invocation,
					semanticModel,
					cancellationToken
				)
			) {
				return true;
			}

			if (
				_IsIntendedMethod(
					invocation,
					"WithGlobalRateLimitOnly",
					_RateLimitingNamespace,
					_ApiRateLimitExtensionsType,
					semanticModel,
					cancellationToken
				)
			) {
				return true;
			}

			if (
				_IsIntendedMethod(
					invocation,
					"WithRateLimitOptOut",
					_RateLimitingNamespace,
					_ApiRateLimitExtensionsType,
					semanticModel,
					cancellationToken
				)
				&& _HasNonEmptyConstantReason(
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

	private static bool _IsNamedPolicyInvocation(
		InvocationExpressionSyntax invocation,
		SemanticModel semanticModel,
		CancellationToken cancellationToken
	) {
		var methodName =
			_GetInvokedMethodName(invocation);
		if (
			methodName is not null
			&& _ApprovedNamedPolicyHelpers.Contains(methodName)
			&& _IsIntendedMethod(
				invocation,
				methodName,
				_RateLimitingNamespace,
				_AnonymousAuthExtensionsType,
				semanticModel,
				cancellationToken
			)
		) {
			return true;
		}

		if (
			!_IsIntendedMethod(
				invocation,
				"RequireRateLimiting",
				_AspNetBuilderNamespace,
				_RateLimiterExtensionsType,
				semanticModel,
				cancellationToken
			)
		) {
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
			&& _KnownNamedPolicies.Contains(policyName);
	}

	private static bool _IsIntendedMethod(
		InvocationExpressionSyntax invocation,
		string methodName,
		string containingNamespace,
		string containingType,
		SemanticModel semanticModel,
		CancellationToken cancellationToken
	) {
		if (
			semanticModel.GetSymbolInfo(
				invocation,
				cancellationToken
			).Symbol is not IMethodSymbol method
		) {
			return false;
		}

		var definition = method.ReducedFrom
			?? method;
		return definition.Name == methodName
			&& definition.ContainingType.Name
				== containingType
			&& definition.ContainingNamespace
				.ToDisplayString()
				== containingNamespace;
	}

	private static bool _HasNonEmptyConstantReason(
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

	private static SyntaxNode _GetFluentChainRoot(
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

	private static string? _GetInvokedMethodName(
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
