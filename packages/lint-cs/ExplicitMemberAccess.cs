using System.Collections.Immutable;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace PublyApp.Analyzers;

internal enum ExplicitMemberAccessKind {
	Instance,
	Static,
}

internal sealed class ExplicitMemberAccessInfo {
	public ExplicitMemberAccessInfo(
		ImmutableArray<ISymbol> symbols,
		INamedTypeSymbol containingType,
		ExplicitMemberAccessKind kind
	) {
		Symbols = symbols;
		ContainingType = containingType;
		Kind = kind;
	}

	public ImmutableArray<ISymbol> Symbols { get; }
	public INamedTypeSymbol ContainingType { get; }
	public ExplicitMemberAccessKind Kind { get; }
}

internal static class ExplicitMemberAccessHelper {
	public static ExplicitMemberAccessInfo? TryGetInfo(
		SyntaxNode node,
		SemanticModel semanticModel,
		CancellationToken cancellationToken
	) {
		if (node is not SimpleNameSyntax name || _IsExcludedName(name)) {
			return null;
		}

		if (_IsGeneratedFile(name, semanticModel, cancellationToken)) {
			return null;
		}

		var containingType = _GetNearestContainingType(name, semanticModel, cancellationToken);
		if (containingType is null) {
			return null;
		}

		var symbolInfo = semanticModel.GetSymbolInfo(name, cancellationToken);
		var symbols = _GetCandidateSymbols(symbolInfo);
		if (symbols.Length == 0 || (symbolInfo.Symbol is null
			&& symbolInfo.CandidateReason != CandidateReason.MemberGroup)) {
			return null;
		}

		var supportedSymbols = ImmutableArray.CreateBuilder<ISymbol>();
		foreach (var symbol in symbols) {
			if (!_IsSupportedMember(symbol, containingType)) {
				return null;
			}

			supportedSymbols.Add(symbol);
		}

		var first = supportedSymbols[0];
		var isStatic = _IsStatic(first);
		for (var index = 1; index < supportedSymbols.Count; index++) {
			if (_IsStatic(supportedSymbols[index]) != isStatic) {
				return null;
			}
		}

		var info = new ExplicitMemberAccessInfo(
			supportedSymbols.ToImmutable(),
			containingType,
			isStatic
				? ExplicitMemberAccessKind.Static
				: ExplicitMemberAccessKind.Instance
		);

		var replacement = CreateReplacement(name, info, semanticModel);
		return replacement is not null ? info : null;
	}

	public static ExpressionSyntax? CreateReplacement(
		SimpleNameSyntax name,
		ExplicitMemberAccessInfo info,
		SemanticModel semanticModel
	) {
		var replacementName = name.WithoutTrivia();
		if (info.Kind == ExplicitMemberAccessKind.Instance) {
			var instanceReplacement = _CreateMemberAccess(
				SyntaxFactory.ThisExpression(),
				replacementName,
				name
			);
			return BindsToSameSymbols(
				instanceReplacement,
				name,
				semanticModel,
				info.Symbols
			)
				? instanceReplacement
				: null;
		}

		var typeName = _GetContainingTypeName(info.ContainingType);
		var receiver = SyntaxFactory.ParseExpression(typeName);
		var replacement = _CreateMemberAccess(receiver, replacementName, name);
		if (BindsToSameSymbols(
			replacement,
			name,
			semanticModel,
			info.Symbols
		)) {
			return replacement;
		}

		var fullyQualifiedTypeName = info.ContainingType.ToDisplayString(
			SymbolDisplayFormat.FullyQualifiedFormat
		);
		var fullyQualifiedReceiver = SyntaxFactory.ParseExpression(
			fullyQualifiedTypeName
		);
		var fullyQualifiedReplacement = _CreateMemberAccess(
			fullyQualifiedReceiver,
			replacementName,
			name
		);
		return BindsToSameSymbols(
			fullyQualifiedReplacement,
			name,
			semanticModel,
			info.Symbols
		)
			? fullyQualifiedReplacement
			: null;
	}

	private static string _GetContainingTypeName(INamedTypeSymbol containingType) {
		var fullName = containingType.ToDisplayString(
			SymbolDisplayFormat.FullyQualifiedFormat
		);
		var namespaceName = containingType.ContainingNamespace.ToDisplayString();
		var namespacePrefix = string.IsNullOrEmpty(namespaceName)
			? "global::"
			: "global::" + namespaceName + ".";
		if (fullName.StartsWith(namespacePrefix, StringComparison.Ordinal)) {
			return fullName.Substring(namespacePrefix.Length);
		}

		return containingType.ToDisplayString(
			SymbolDisplayFormat.MinimallyQualifiedFormat
		);
	}

	public static bool BindsToSameSymbols(
		ExpressionSyntax replacement,
		SyntaxNode original,
		SemanticModel semanticModel,
		ImmutableArray<ISymbol> expectedSymbols
	) {
		var contextualNode = _GetContextualNode(original);
		if (contextualNode is not null
			&& _TryGetContextualSymbolInfo(
				contextualNode,
				replacement,
				original,
				semanticModel,
				out var contextualSymbolInfo
			)) {
			return _SameSymbols(
				expectedSymbols,
				_GetCandidateSymbols(contextualSymbolInfo)
			);
		}

		var replacementInfo = semanticModel.GetSpeculativeSymbolInfo(
			original.SpanStart,
			replacement,
			SpeculativeBindingOption.BindAsExpression
		);
		return _SameSymbols(expectedSymbols, _GetCandidateSymbols(replacementInfo));
	}

	private static SyntaxNode? _GetContextualNode(SyntaxNode original) {
		foreach (var ancestor in original.Ancestors()) {
			if (ancestor is ArrowExpressionClauseSyntax
				or StatementSyntax
				or ConstructorInitializerSyntax
				or AttributeSyntax) {
				return ancestor;
			}
		}

		return original.Ancestors().FirstOrDefault(
			ancestor => ancestor is EqualsValueClauseSyntax
		);
	}

	private static bool _TryGetContextualSymbolInfo(
		SyntaxNode contextualNode,
		ExpressionSyntax replacement,
		SyntaxNode original,
		SemanticModel semanticModel,
		out SymbolInfo symbolInfo
	) {
		var replacementAnnotation = new SyntaxAnnotation();
		var annotatedReplacement = replacement.WithAdditionalAnnotations(
			replacementAnnotation
		);
		var replacedContext = contextualNode.ReplaceNode(
			original,
			annotatedReplacement
		);
		SemanticModel? speculativeModel = null;
		var position = original.SpanStart;
		var created = replacedContext switch {
			EqualsValueClauseSyntax initializer =>
				semanticModel.TryGetSpeculativeSemanticModel(
					position,
					initializer,
					out speculativeModel
				),
			ArrowExpressionClauseSyntax expressionBody =>
				semanticModel.TryGetSpeculativeSemanticModel(
					position,
					expressionBody,
					out speculativeModel
				),
			StatementSyntax statement =>
				semanticModel.TryGetSpeculativeSemanticModel(
					position,
					statement,
					out speculativeModel
				),
			ConstructorInitializerSyntax constructorInitializer =>
				semanticModel.TryGetSpeculativeSemanticModel(
					position,
					constructorInitializer,
					out speculativeModel
				),
			AttributeSyntax attribute =>
				semanticModel.TryGetSpeculativeSemanticModel(
					position,
					attribute,
					out speculativeModel
				),
			_ => false,
		};

		if (!created || speculativeModel is null) {
			symbolInfo = default;
			return false;
		}

		var speculativeReplacement = replacedContext
			.GetAnnotatedNodes(replacementAnnotation)
			.OfType<ExpressionSyntax>()
			.Single();
		symbolInfo = speculativeModel.GetSymbolInfo(speculativeReplacement);
		return true;
	}

	private static ExpressionSyntax _CreateMemberAccess(
		ExpressionSyntax receiver,
		SimpleNameSyntax name,
		SimpleNameSyntax originalName
	) {
		return SyntaxFactory.MemberAccessExpression(
			SyntaxKind.SimpleMemberAccessExpression,
			receiver,
			name
		)
			.WithLeadingTrivia(originalName.GetLeadingTrivia())
			.WithTrailingTrivia(originalName.GetTrailingTrivia());
	}

	private static ImmutableArray<ISymbol> _GetCandidateSymbols(SymbolInfo symbolInfo) {
		if (symbolInfo.Symbol is not null) {
			return ImmutableArray.Create(symbolInfo.Symbol);
		}

		return symbolInfo.CandidateSymbols;
	}

	private static INamedTypeSymbol? _GetNearestContainingType(
		SimpleNameSyntax name,
		SemanticModel semanticModel,
		CancellationToken cancellationToken
	) {
		foreach (var ancestor in name.AncestorsAndSelf()) {
			if (ancestor is not TypeDeclarationSyntax typeDeclaration) {
				continue;
			}

			return semanticModel.GetDeclaredSymbol(
				typeDeclaration,
				cancellationToken
			);
		}

		return null;
	}

	private static bool _IsSupportedMember(
		ISymbol symbol,
		INamedTypeSymbol containingType
	) {
		if (symbol is not IFieldSymbol
			and not IPropertySymbol
			and not IEventSymbol
			and not IMethodSymbol) {
			return false;
		}

		if (symbol is IMethodSymbol method
			&& (method.MethodKind != MethodKind.Ordinary || method.IsExtensionMethod)) {
			return false;
		}

		return symbol.ContainingType is not null
			&& _IsInContainingTypeHierarchy(symbol.ContainingType, containingType);
	}

	private static bool _IsInContainingTypeHierarchy(
		INamedTypeSymbol declaringType,
		INamedTypeSymbol containingType
	) {
		for (var current = containingType; current is not null; current = current.BaseType) {
			if (SymbolEqualityComparer.Default.Equals(current, declaringType)) {
				return true;
			}
		}

		foreach (var interfaceType in containingType.AllInterfaces) {
			if (SymbolEqualityComparer.Default.Equals(interfaceType, declaringType)) {
				return true;
			}
		}

		return false;
	}

	private static bool _IsStatic(ISymbol symbol) {
		return symbol switch {
			IFieldSymbol field => field.IsStatic,
			IPropertySymbol property => property.IsStatic,
			IEventSymbol @event => @event.IsStatic,
			IMethodSymbol method => method.IsStatic,
			_ => false,
		};
	}

	private static bool _IsExcludedName(SimpleNameSyntax name) {
		if (name.Parent is MemberAccessExpressionSyntax memberAccess
			&& memberAccess.Name == name) {
			return true;
		}

		if (name.Parent is MemberBindingExpressionSyntax memberBinding
			&& memberBinding.Name == name) {
			return true;
		}

		if (name.Parent is QualifiedNameSyntax qualifiedName
			&& qualifiedName.Right == name) {
			return true;
		}

		if (name.Parent is AliasQualifiedNameSyntax aliasQualifiedName
			&& aliasQualifiedName.Name == name) {
			return true;
		}

		if (name.Parent is NameColonSyntax or NameEqualsSyntax) {
			return true;
		}

		if (_IsInitializerDesignator(name) || _IsPropertyPatternDesignator(name)) {
			return true;
		}

		return false;
	}

	private static bool _IsInitializerDesignator(SimpleNameSyntax name) {
		if (name.Parent is not AssignmentExpressionSyntax assignment
			|| assignment.Left != name) {
			return false;
		}

		return assignment.Parent is InitializerExpressionSyntax;
	}

	private static bool _IsPropertyPatternDesignator(SimpleNameSyntax name) {
		return name.Parent is NameColonSyntax nameColon
			&& nameColon.Name == name
			&& nameColon.Parent is SubpatternSyntax
			&& nameColon.Parent.Parent is PropertyPatternClauseSyntax;
	}

	private static bool _SameSymbols(
		ImmutableArray<ISymbol> expectedSymbols,
		ImmutableArray<ISymbol> actualSymbols
	) {
		if (expectedSymbols.Length != actualSymbols.Length) {
			return false;
		}

		foreach (var expected in expectedSymbols) {
			if (!actualSymbols.Any(
				actual => SymbolEqualityComparer.Default.Equals(expected, actual)
			)) {
				return false;
			}
		}

		return true;
	}

	private static bool _IsRepositoryGeneratedPath(string path) {
		var normalizedPath = path.Replace('\\', '/');
		var migrationsPath = "/apps/api/Migrations/";
		if (normalizedPath.IndexOf(migrationsPath, StringComparison.Ordinal) < 0
			&& !normalizedPath.StartsWith(
				"apps/api/Migrations/",
				StringComparison.Ordinal
			)) {
			return false;
		}

		return !normalizedPath.EndsWith(".Spec.cs", StringComparison.Ordinal);
	}

	public static bool IsRepositoryGeneratedFile(SyntaxTree syntaxTree) {
		return _IsRepositoryGeneratedPath(syntaxTree.FilePath);
	}

	private static bool _IsGeneratedFile(
		SimpleNameSyntax name,
		SemanticModel semanticModel,
		CancellationToken cancellationToken
	) {
		var syntaxTree = name.SyntaxTree;
		if (IsRepositoryGeneratedFile(syntaxTree)) {
			return true;
		}

		var normalizedPath = syntaxTree.FilePath.Replace('\\', '/');
		if (normalizedPath.EndsWith(".g.cs", StringComparison.OrdinalIgnoreCase)
			|| normalizedPath.EndsWith(".designer.cs", StringComparison.OrdinalIgnoreCase)
			|| normalizedPath.EndsWith(".generated.cs", StringComparison.OrdinalIgnoreCase)) {
			return true;
		}

		var root = syntaxTree.GetRoot(cancellationToken);
		if (root.GetLeadingTrivia().ToFullString().Contains(
			"<auto-generated",
			StringComparison.OrdinalIgnoreCase
		)) {
			return true;
		}

		foreach (var ancestor in name.AncestorsAndSelf()) {
			if (ancestor is not MemberDeclarationSyntax declaration) {
				continue;
			}

			var symbol = semanticModel.GetDeclaredSymbol(declaration, cancellationToken);
			if (symbol is not null && _HasGeneratedCodeAttribute(symbol)) {
				return true;
			}
		}

		return false;
	}

	private static bool _HasGeneratedCodeAttribute(ISymbol symbol) {
		return symbol.GetAttributes().Any(attribute =>
			attribute.AttributeClass?.ToDisplayString() ==
			"System.CodeDom.Compiler.GeneratedCodeAttribute"
		);
	}
}

[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class ExplicitMemberAccessAnalyzer : DiagnosticAnalyzer {
	public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics {
		get { return ImmutableArray.Create(DiagnosticCatalog.ExplicitMemberAccess); }
	}

	public override void Initialize(AnalysisContext context) {
		context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
		context.EnableConcurrentExecution();
		context.RegisterSyntaxNodeAction(
			_AnalyzeName,
			SyntaxKind.IdentifierName,
			SyntaxKind.GenericName
		);
	}

	private static void _AnalyzeName(SyntaxNodeAnalysisContext context) {
		if (context.Node is not SimpleNameSyntax name) {
			return;
		}

		var info = ExplicitMemberAccessHelper.TryGetInfo(
			name,
			context.SemanticModel,
			context.CancellationToken
		);
		if (info is null) {
			return;
		}

		context.ReportDiagnostic(
			Diagnostic.Create(
				DiagnosticCatalog.ExplicitMemberAccess,
				name.Identifier.GetLocation(),
				name.Identifier.ValueText
			)
		);
	}
}
