using System.Collections.Immutable;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace PublyApp.Analyzers;

/// <summary>
/// PUBLY0005 — flags inline FluentValidation chains on JsonElement RuleFor selectors so
/// code uses shared <c>JsonElementRules</c> helpers instead of repeating common logic.
///
/// Conservative heuristic:
/// - only checks classes that inherit <c>AbstractValidator&lt;...&gt;</c>
/// - only checks chains where the RuleFor selector resolves to a JsonElement value
/// - only reports when a known inline FluentValidation operator resolves in the chain
/// This intentionally prefers false negatives over noisy false positives during the ship phase.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class InlineFluentValidationChainAnalyzer : DiagnosticAnalyzer {
	private const string FluentValidationNamespace = "FluentValidation";
	private const string PublyJsonElementRulesNamespace = "PublyApp.Api.Lib.Validation";

	private static readonly ImmutableHashSet<string> InlineValidationOperators = [
		"NotEmpty",
		"NotNull",
		"MaximumLength",
		"MinimumLength",
		"EmailAddress",
		"Matches",
		"Must",
		"GreaterThan",
		"GreaterThanOrEqualTo",
		"LessThan",
		"LessThanOrEqualTo",
	];

	private static readonly ImmutableHashSet<string> FluentValidationOperatorTypes = [
		"DefaultValidatorExtensions",
		"PredicateValidatorExtensions",
		"ComparisonValidatorExtensions",
		"LengthValidatorExtensions",
		"RegularExpressionValidatorExtensions",
	];

	public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics {
		get { return ImmutableArray.Create(DiagnosticCatalog.InlineFluentValidationChain); }
	}

	public override void Initialize(AnalysisContext context) {
		// Ignore compiler-generated trees so this rule does not block clients or build output.
		context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
		context.EnableConcurrentExecution();
		context.RegisterSyntaxNodeAction(AnalyzeInvocation, SyntaxKind.InvocationExpression);
	}

	private static void AnalyzeInvocation(SyntaxNodeAnalysisContext context) {
		if (context.Node is not InvocationExpressionSyntax invocation) {
			return;
		}

		if (!IsOutermostInvocation(invocation)) {
			return;
		}

		if (!IsValidatorType(invocation, context.SemanticModel, out var ruleForInvocation)
			|| ruleForInvocation is null) {
			return;
		}

		if (!IsJsonElementRuleFor(ruleForInvocation, context.SemanticModel)) {
			return;
		}

		var chain = GetInvocationChain(invocation);

		if (!ContainsInlineValidationOperator(chain, context.SemanticModel)) {
			return;
		}

		var ruleForName = GetInvocationNameSyntax(ruleForInvocation);
		if (ruleForName is null) {
			return;
		}

		var diagnostic = Diagnostic.Create(
			DiagnosticCatalog.InlineFluentValidationChain,
			ruleForName.GetLocation());

		context.ReportDiagnostic(diagnostic);
	}

	private static bool IsOutermostInvocation(InvocationExpressionSyntax invocation) {
		return invocation.Parent is not MemberAccessExpressionSyntax {
			Parent: InvocationExpressionSyntax
		};
	}

	private static bool IsValidatorType(
		InvocationExpressionSyntax invocation,
		SemanticModel semanticModel,
		out InvocationExpressionSyntax? ruleForInvocation
	) {
		ruleForInvocation = GetContainingRuleForInvocation(invocation, semanticModel);
		if (ruleForInvocation is null) {
			return false;
		}

		var containingType = ruleForInvocation
			.FirstAncestorOrSelf<TypeDeclarationSyntax>();
		if (containingType is null) {
			return false;
		}

		var containingTypeSymbol = semanticModel.GetDeclaredSymbol(containingType);

		for (var current = containingTypeSymbol; current is not null; current = current.BaseType) {
			if (IsAbstractValidatorType(current)) {
				return true;
			}
		}

		return false;
	}

	private static InvocationExpressionSyntax? GetContainingRuleForInvocation(
		InvocationExpressionSyntax invocation,
		SemanticModel semanticModel
	) {
		foreach (var current in GetInvocationChain(invocation)) {
			var methodSymbol = GetMethodSymbol(current, semanticModel);
			if (methodSymbol is null) {
				continue;
			}

			if (methodSymbol.Name == "RuleFor"
				&& IsAbstractValidatorType(methodSymbol.ContainingType)) {
				return current;
			}
		}

		return null;
	}

	private static bool IsJsonElementRuleFor(
		InvocationExpressionSyntax ruleForInvocation,
		SemanticModel semanticModel
	) {
		if (ruleForInvocation.ArgumentList.Arguments.Count != 1) {
			return false;
		}

		if (ruleForInvocation.ArgumentList.Arguments[0].Expression is not LambdaExpressionSyntax lambda) {
			return false;
		}

		if (lambda.Body is not (InvocationExpressionSyntax or MemberAccessExpressionSyntax)) {
			return false;
		}

		var selectorType = semanticModel.GetTypeInfo(lambda.Body).Type;
		return IsJsonElementOrNullableJsonElement(selectorType);
	}

	private static bool ContainsInlineValidationOperator(
		IEnumerable<InvocationExpressionSyntax> chain,
		SemanticModel semanticModel
	) {
		foreach (var invocation in chain) {
			var methodSymbol = GetMethodSymbol(invocation, semanticModel);
			if (methodSymbol is null) {
				continue;
			}

			if (IsInlineValidationOperator(methodSymbol)) {
				return true;
			}
		}

		return false;
	}

	private static IEnumerable<InvocationExpressionSyntax> GetInvocationChain(
		InvocationExpressionSyntax invocation
	) {
		var chain = new List<InvocationExpressionSyntax>([invocation]);

		var current = invocation;
		while (current.Expression is MemberAccessExpressionSyntax memberAccess
			&& memberAccess.Expression is InvocationExpressionSyntax previous) {
			chain.Add(previous);
			current = previous;
		}

		return chain;
	}

	private static SimpleNameSyntax? GetInvocationNameSyntax(InvocationExpressionSyntax invocation) {
		if (invocation.Expression is MemberAccessExpressionSyntax memberAccess) {
			return memberAccess.Name;
		}

		if (invocation.Expression is MemberBindingExpressionSyntax memberBinding) {
			return memberBinding.Name;
		}

		return invocation.Expression as IdentifierNameSyntax;
	}

	private static IMethodSymbol? GetMethodSymbol(
		InvocationExpressionSyntax invocation,
		SemanticModel semanticModel
	) {
		var symbolInfo = semanticModel.GetSymbolInfo(invocation);
		return symbolInfo.Symbol as IMethodSymbol;
	}

	private static bool IsInlineValidationOperator(IMethodSymbol methodSymbol) {
		if (IsPublyJsonElementRulesMethod(methodSymbol)) {
			return false;
		}

		if (!InlineValidationOperators.Contains(methodSymbol.Name)) {
			return false;
		}

		var containingType = methodSymbol.ContainingType;
		if (containingType is null) {
			return false;
		}

		return IsInNamespace(containingType, FluentValidationNamespace)
			&& (FluentValidationOperatorTypes.Contains(containingType.Name)
				|| containingType.Name.IndexOf("RuleBuilder", StringComparison.Ordinal) >= 0);
	}

	private static bool IsAbstractValidatorType(INamedTypeSymbol? type) {
		if (type is null) {
			return false;
		}

		return type.OriginalDefinition.Name == "AbstractValidator"
			&& type.OriginalDefinition.Arity == 1
			&& IsInNamespace(type.OriginalDefinition, FluentValidationNamespace);
	}

	private static bool IsPublyJsonElementRulesMethod(IMethodSymbol methodSymbol) {
		var containingType = methodSymbol.ContainingType;
		if (containingType is null) {
			return false;
		}

		return containingType.Name == "JsonElementRules"
			&& IsInNamespace(containingType, PublyJsonElementRulesNamespace);
	}

	private static bool IsInNamespace(INamedTypeSymbol type, string expectedNamespace) {
		return type.ContainingNamespace?.ToDisplayString() == expectedNamespace;
	}

	private static bool IsJsonElementOrNullableJsonElement(ITypeSymbol? type) {
		if (type is null) {
			return false;
		}

		if (type.Name == "JsonElement") {
			return type.ContainingNamespace?.ToDisplayString() == "System.Text.Json";
		}

		if (type is INamedTypeSymbol namedType
			&& namedType.OriginalDefinition.SpecialType == SpecialType.System_Nullable_T
			&& namedType.TypeArguments.Length == 1) {
			var argumentType = namedType.TypeArguments[0];
			return IsJsonElementOrNullableJsonElement(argumentType);
		}

		return false;
	}
}
