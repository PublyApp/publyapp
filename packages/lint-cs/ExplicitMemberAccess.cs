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
		if (node is not SimpleNameSyntax name || IsExcludedName(name)) {
			return null;
		}

		var containingType = GetNearestContainingType(name, semanticModel, cancellationToken);
		if (containingType is null) {
			return null;
		}

		var symbolInfo = semanticModel.GetSymbolInfo(name, cancellationToken);
		if (symbolInfo.Symbol is null) {
			return null;
		}

		var symbols = ImmutableArray.Create(symbolInfo.Symbol);

		var supportedSymbols = ImmutableArray.CreateBuilder<ISymbol>();
		foreach (var symbol in symbols) {
			if (!IsSupportedMember(symbol, containingType)) {
				return null;
			}

			supportedSymbols.Add(symbol);
		}

		var first = supportedSymbols[0];
		var isStatic = IsStatic(first);
		for (var index = 1; index < supportedSymbols.Count; index++) {
			if (IsStatic(supportedSymbols[index]) != isStatic) {
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
			var instanceReplacement = CreateMemberAccess(
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

		var typeName = GetContainingTypeName(info.ContainingType);
		var receiver = SyntaxFactory.ParseExpression(typeName);
		var replacement = CreateMemberAccess(receiver, replacementName, name);
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
		var fullyQualifiedReplacement = CreateMemberAccess(
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

	private static string GetContainingTypeName(INamedTypeSymbol containingType) {
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
		var replacementInfo = semanticModel.GetSpeculativeSymbolInfo(
			original.SpanStart,
			replacement,
			SpeculativeBindingOption.BindAsExpression
		);
		return SameSymbols(expectedSymbols, GetCandidateSymbols(replacementInfo));
	}

	private static ExpressionSyntax CreateMemberAccess(
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

	private static ImmutableArray<ISymbol> GetCandidateSymbols(SymbolInfo symbolInfo) {
		if (symbolInfo.Symbol is not null) {
			return ImmutableArray.Create(symbolInfo.Symbol);
		}

		return symbolInfo.CandidateSymbols;
	}

	private static INamedTypeSymbol? GetNearestContainingType(
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

	private static bool IsSupportedMember(
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
			&& IsInContainingTypeHierarchy(symbol.ContainingType, containingType);
	}

	private static bool IsInContainingTypeHierarchy(
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

	private static bool IsStatic(ISymbol symbol) {
		return symbol switch {
			IFieldSymbol field => field.IsStatic,
			IPropertySymbol property => property.IsStatic,
			IEventSymbol @event => @event.IsStatic,
			IMethodSymbol method => method.IsStatic,
			_ => false,
		};
	}

	private static bool IsExcludedName(SimpleNameSyntax name) {
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

		if (IsInitializerDesignator(name) || IsPropertyPatternDesignator(name)) {
			return true;
		}

		return false;
	}

	private static bool IsInitializerDesignator(SimpleNameSyntax name) {
		if (name.Parent is not AssignmentExpressionSyntax assignment
			|| assignment.Left != name) {
			return false;
		}

		return assignment.Ancestors().Any(
			ancestor => ancestor is InitializerExpressionSyntax
		);
	}

	private static bool IsPropertyPatternDesignator(SimpleNameSyntax name) {
		return name.Ancestors().Any(
			ancestor => ancestor is PropertyPatternClauseSyntax
		);
	}

	private static bool SameSymbols(
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

	private static bool IsRepositoryGeneratedPath(string path) {
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
		return IsRepositoryGeneratedPath(syntaxTree.FilePath);
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
			AnalyzeName,
			SyntaxKind.IdentifierName,
			SyntaxKind.GenericName
		);
	}

	private static void AnalyzeName(SyntaxNodeAnalysisContext context) {
		if (ExplicitMemberAccessHelper.IsRepositoryGeneratedFile(context.Node.SyntaxTree)) {
			return;
		}

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
