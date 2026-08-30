using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;
using Microsoft.CodeAnalysis.Operations;

namespace PublyApp.Analyzers;

/// <summary>
/// PUBLY0006 — flags request DTO getter calls in handler <c>Handle</c> methods when the value is
/// reused without local caching, or when the getter return type is parsing-sensitive (for now,
/// <c>PatchField&lt;T&gt;</c>). The analyzer is explicit about the getter call site in its message.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class UncachedBodyGetterAnalyzer : DiagnosticAnalyzer {
	private static readonly global::System.Collections.Immutable.ImmutableHashSet<string> ParsingSensitiveReturnTypeMetadataNames =
		global::System.Collections.Immutable.ImmutableHashSet.Create(
		global::System.StringComparer.Ordinal,
		"PatchField`1"
	// Extend in phase-2 enforcement:
	// - TrimmedString
	// - ParsedDateTime
	// - ParsedEnum
	);

	public override global::System.Collections.Immutable.ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics {
		get { return global::System.Collections.Immutable.ImmutableArray.Create(DiagnosticCatalog.UncachedBodyGetter); }
	}

	public override void Initialize(AnalysisContext context) {
		// Skip generated code (e.g. Kiota client, EF migrations) to avoid penalizing code the repo
		// does not hand-author.
		context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
		// Required for analyzers that call thread-safe Roslyn APIs; the SDK enforces this when
		// EnforceExtendedAnalyzerRules is enabled.
		context.EnableConcurrentExecution();
		// Analyze each operation block so we can reason across getter call sites in one method.
		context.RegisterOperationBlockStartAction(AnalyzeHandleOperationBlock);
	}

	private static void AnalyzeHandleOperationBlock(OperationBlockStartAnalysisContext context) {
		if (context.OwningSymbol is not IMethodSymbol handleMethod) {
			return;
		}

		if (!IsHandlerHandleMethod(handleMethod)) {
			return;
		}

		var usageByParameter = new global::System.Collections.Generic.Dictionary<IParameterSymbol, global::System.Collections.Generic.Dictionary<IMethodSymbol, GetterUsage>>(
			SymbolEqualityComparer.Default);

		context.RegisterOperationAction(
			AnalyzeInvocation,
			OperationKind.Invocation);
		context.RegisterOperationBlockEndAction(ReportDiagnostics);

		void AnalyzeInvocation(OperationAnalysisContext operationContext) {
			if (operationContext.Operation is not IInvocationOperation invocation) {
				return;
			}

			if (!TryGetTrackedInvocation(
				invocation,
				out var requestParameter,
				out var getterMethod)
				|| requestParameter is null
				|| getterMethod is null) {
				return;
			}

			if (!usageByParameter.TryGetValue(requestParameter, out var byMethod)) {
				byMethod = new global::System.Collections.Generic.Dictionary<IMethodSymbol, GetterUsage>(SymbolEqualityComparer.Default);
				usageByParameter[requestParameter] = byMethod;
			}

			if (!byMethod.TryGetValue(getterMethod, out var usage)) {
				usage = new GetterUsage(isParsingSensitive: IsParsingSensitiveReturnType(getterMethod));
				byMethod[getterMethod] = usage;
			}

			var isCacheDecl = IsInvocationCachedToLocal(invocation);
			usage.Invocations.Add(invocation);
			if (isCacheDecl) {
				usage.IsCachedToLocal = true;
			} else {
				usage.DirectInvocations.Add(invocation);
			}
		}

		void ReportDiagnostics(OperationBlockAnalysisContext blockContext) {
			foreach (var requestPair in usageByParameter) {
				var requestParameter = requestPair.Key;
				var byMethod = requestPair.Value;

				foreach (var methodPair in byMethod) {
					var getterMethod = methodPair.Key;
					var usage = methodPair.Value;

					if (!ShouldReport(usage)) {
						continue;
					}

					var getterName = $"{requestParameter.Name}.{getterMethod.Name}()";
					// Report only the direct (uncached) invocations — not the cache-initializer.
					var invocationsToReport = usage.IsCachedToLocal
						? usage.DirectInvocations
						: usage.Invocations;
					foreach (var invocation in invocationsToReport) {
						blockContext.ReportDiagnostic(
							Diagnostic.Create(
								DiagnosticCatalog.UncachedBodyGetter,
								invocation.Syntax.GetLocation(),
								getterName));
					}
				}
			}
		}
	}

	private static bool IsHandlerHandleMethod(IMethodSymbol method) {
		if (!method.IsStatic || method.Name != "Handle") {
			return false;
		}

		var containingType = method.ContainingType;
		if (containingType is null) {
			return false;
		}

		return containingType.DeclaredAccessibility == Accessibility.Public
			&& containingType.IsSealed;
	}

	private static bool TryGetTrackedInvocation(
		IInvocationOperation invocation,
		out IParameterSymbol? requestParameter,
		out IMethodSymbol? getterMethod
	) {
		requestParameter = null;
		getterMethod = null;

		if (invocation.Instance is not IParameterReferenceOperation parameterRef) {
			return false;
		}

		var parameter = parameterRef.Parameter;
		if (parameter is null) {
			return false;
		}

		var parameterName = parameter.Name;
		if (parameterName is not "body" and not "query") {
			return false;
		}

		if (invocation.Arguments.Length != 0) {
			return false;
		}

		var method = invocation.TargetMethod;
		if (method is null) {
			return false;
		}

		if (!method.Name.StartsWith("Get", global::System.StringComparison.Ordinal)) {
			return false;
		}

		requestParameter = parameter;
		getterMethod = method;
		return true;
	}

	private static bool IsInvocationCachedToLocal(IInvocationOperation invocation) {
		return invocation.Syntax.Parent is EqualsValueClauseSyntax equalsValueClause
			&& equalsValueClause.Parent is VariableDeclaratorSyntax;
	}

	private static bool ShouldReport(GetterUsage usage) {
		var directCount = usage.DirectInvocations.Count;
		// Cached once and used only via the local → no report.
		// Cached once + 1+ additional direct call → report (mixed anti-pattern).
		// Not cached + 1 direct call, non-parsing-sensitive → no report.
		// Not cached + 1 direct call, parsing-sensitive (PatchField<T>) → report.
		// 2+ direct calls → report.
		return directCount >= 2
			|| ((usage.IsParsingSensitive || usage.IsCachedToLocal) && directCount >= 1);
	}

	private static bool IsParsingSensitiveReturnType(IMethodSymbol getterMethod) {
		if (getterMethod.ReturnType is not INamedTypeSymbol returnType) {
			return false;
		}

		return ParsingSensitiveReturnTypeMetadataNames.Contains(returnType.MetadataName);
	}

	private sealed class GetterUsage {
		/// <summary>All invocations of this getter, including any cache-initializer declaration.</summary>
		public readonly global::System.Collections.Generic.List<IInvocationOperation> Invocations =
			new();
		/// <summary>Invocations that are NOT the local-declaration cache initializer.</summary>
		public readonly global::System.Collections.Generic.List<IInvocationOperation> DirectInvocations =
			new();
		public bool IsCachedToLocal;
		public bool IsParsingSensitive;

		public GetterUsage(bool isParsingSensitive) {
			IsParsingSensitive = isParsingSensitive;
		}
	}
}
