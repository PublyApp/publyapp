using System.Collections.Immutable;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace PublyApp.Analyzers;

/// <summary>
/// PUBLY0013 — a type marked with <c>[OnlyInjectedInto(...)]</c> may only be requested by the
/// classes named in the attribute. The analyzer covers every container shape DI resolves
/// (the bare port, an array and the usual generic collections) in the three places a service
/// is requested: a constructor parameter (primary constructors included), a method parameter
/// marked <c>[FromServices]</c>, and <c>GetRequiredService&lt;T&gt;</c>/<c>GetService&lt;T&gt;</c>/
/// <c>GetServices&lt;T&gt;</c>. The registration extension that declares <c>AddSocialAdapter</c>
/// and test projects are exempt.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class OnlyInjectedIntoAnalyzer : DiagnosticAnalyzer {
	private const string _AttributeName = "OnlyInjectedIntoAttribute";
	private const string _RegistrationMethodName = "AddSocialAdapter";
	private const string _DependencyInjectionNamespace = "Microsoft.Extensions.DependencyInjection";

	private static readonly ImmutableHashSet<string> _ServiceResolutionMethods =
		ImmutableHashSet.Create(
			StringComparer.Ordinal,
			"GetRequiredService",
			"GetService",
			"GetServices");

	// Every collection shape Microsoft DI resolves for a constructor. List<> and
	// IReadOnlyCollection<> are included because they implement IEnumerable<T>, exactly like
	// the architecture spec's reflection guard.
	private static readonly ImmutableHashSet<string> _CollectionMetadataNames =
		ImmutableHashSet.Create(
			StringComparer.Ordinal,
			"IEnumerable`1",
			"IReadOnlyList`1",
			"IReadOnlyCollection`1",
			"ICollection`1",
			"IList`1",
			"List`1");

	private static readonly SymbolDisplayFormat _DisplayFormat =
		SymbolDisplayFormat.MinimallyQualifiedFormat;

	public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics {
		get { return ImmutableArray.Create(DiagnosticCatalog.OnlyInjectedInto); }
	}

	public override void Initialize(AnalysisContext context) {
		// Skip generated code (e.g. Kiota clients, EF migrations) the repo does not hand-author.
		context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
		context.EnableConcurrentExecution();
		context.RegisterCompilationStartAction(startContext => {
			if (_IsTestAssembly(startContext.Compilation.AssemblyName)) {
				return;
			}

			startContext.RegisterSyntaxNodeAction(_AnalyzeParameter, SyntaxKind.Parameter);
			startContext.RegisterSyntaxNodeAction(_AnalyzeInvocation, SyntaxKind.InvocationExpression);
		});
	}

	private static void _AnalyzeParameter(SyntaxNodeAnalysisContext context) {
		if (context.Node is not ParameterSyntax parameter
			|| context.SemanticModel.GetDeclaredSymbol(parameter, context.CancellationToken)
				is not IParameterSymbol symbol) {
			return;
		}

		var owner = parameter.Parent?.Parent;
		var isConstructorParameter = owner is ConstructorDeclarationSyntax or TypeDeclarationSyntax;
		var isFromServices = symbol.GetAttributes().Any(attribute =>
			attribute.AttributeClass?.Name == "FromServicesAttribute");
		var isInjectedMethodParameter =
			owner is MethodDeclarationSyntax or LocalFunctionStatementSyntax && isFromServices;

		if (!isConstructorParameter && !isInjectedMethodParameter) {
			return;
		}

		var containingType = symbol.ContainingType;
		if (containingType is null || _IsRegistrationExtension(containingType)) {
			return;
		}

		_ReportIfProtected(
			context,
			symbol.Type,
			containingType,
			parameter.Type?.GetLocation() ?? parameter.Identifier.GetLocation());
	}

	private static void _AnalyzeInvocation(SyntaxNodeAnalysisContext context) {
		if (context.Node is not InvocationExpressionSyntax invocation
			|| !_TryGetGenericTypeArgument(invocation, out var typeArgument)) {
			return;
		}

		if (context.SemanticModel.GetSymbolInfo(invocation, context.CancellationToken).Symbol
			is not IMethodSymbol method
			|| !_IsServiceResolution(method)
			|| _IsRegistrationExtension(context.ContainingSymbol)) {
			return;
		}

		var requestedType = context.SemanticModel
			.GetTypeInfo(typeArgument, context.CancellationToken)
			.Type;
		if (requestedType is null) {
			return;
		}

		var containingType = context.ContainingSymbol?.ContainingType;
		if (containingType is null) {
			return;
		}

		_ReportIfProtected(context, requestedType, containingType, typeArgument.GetLocation());
	}

	private static void _ReportIfProtected(
		SyntaxNodeAnalysisContext context,
		ITypeSymbol requestedType,
		INamedTypeSymbol containingType,
		Location location) {
		if (!_TryGetProtectedPort(requestedType, out var port, out var allowed)
			|| _IsAllowed(containingType, allowed)) {
			return;
		}

		var allowedNames = allowed.IsDefaultOrEmpty
			? "no class"
			: string.Join(", ", allowed.Select(type => type.ToDisplayString(_DisplayFormat)));

		context.ReportDiagnostic(Diagnostic.Create(
			DiagnosticCatalog.OnlyInjectedInto,
			location,
			port.ToDisplayString(_DisplayFormat),
			allowedNames));
	}

	private static bool _TryGetGenericTypeArgument(
		InvocationExpressionSyntax invocation,
		out TypeSyntax typeArgument) {
		typeArgument = null!;

		GenericNameSyntax? genericName = invocation.Expression switch {
			GenericNameSyntax direct => direct,
			MemberAccessExpressionSyntax { Name: GenericNameSyntax member } => member,
			_ => null,
		};

		if (genericName is null || genericName.TypeArgumentList.Arguments.Count != 1) {
			return false;
		}

		typeArgument = genericName.TypeArgumentList.Arguments[0];
		return true;
	}

	private static bool _IsServiceResolution(IMethodSymbol method) {
		return _ServiceResolutionMethods.Contains(method.Name)
			&& method.ContainingNamespace?.ToDisplayString() == _DependencyInjectionNamespace;
	}

	private static bool _TryGetProtectedPort(
		ITypeSymbol requestedType,
		out INamedTypeSymbol port,
		out ImmutableArray<INamedTypeSymbol> allowed) {
		port = null!;
		allowed = default;

		if (_UnwrapCollection(requestedType) is not INamedTypeSymbol named) {
			return false;
		}

		var attribute = named.GetAttributes().FirstOrDefault(candidate =>
			candidate.AttributeClass?.Name == _AttributeName);
		if (attribute is null) {
			return false;
		}

		port = named;
		allowed = _AllowedTypes(attribute);
		return true;
	}

	private static ITypeSymbol _UnwrapCollection(ITypeSymbol type) {
		if (type is IArrayTypeSymbol array) {
			return array.ElementType;
		}

		if (type is INamedTypeSymbol named
			&& named.IsGenericType
			&& named.TypeArguments.Length == 1
			&& _CollectionMetadataNames.Contains(named.ConstructedFrom.MetadataName)) {
			return named.TypeArguments[0];
		}

		return type;
	}

	private static ImmutableArray<INamedTypeSymbol> _AllowedTypes(AttributeData attribute) {
		if (attribute.ConstructorArguments.Length == 0
			|| attribute.ConstructorArguments[0] is not { Kind: TypedConstantKind.Array } argument) {
			return ImmutableArray<INamedTypeSymbol>.Empty;
		}

		return argument.Values
			.Select(value => value.Value as INamedTypeSymbol)
			.Where(type => type is not null)
			.Select(type => type!)
			.ToImmutableArray();
	}

	private static bool _IsAllowed(
		INamedTypeSymbol containingType,
		ImmutableArray<INamedTypeSymbol> allowed) {
		return !allowed.IsDefaultOrEmpty
			&& allowed.Any(candidate => SymbolEqualityComparer.Default.Equals(
				candidate.OriginalDefinition,
				containingType.OriginalDefinition));
	}

	private static bool _IsRegistrationExtension(ISymbol? symbol) {
		for (var current = symbol; current is not null; current = current.ContainingSymbol) {
			if (current.Name == _RegistrationMethodName) {
				return true;
			}

			if (current is INamedTypeSymbol type && _IsRegistrationExtension(type)) {
				return true;
			}
		}

		return false;
	}

	private static bool _IsRegistrationExtension(INamedTypeSymbol type) {
		return type.GetMembers(_RegistrationMethodName).Length > 0;
	}

	private static bool _IsTestAssembly(string? assemblyName) {
		return assemblyName is not null
			&& assemblyName.EndsWith(".Tests", StringComparison.OrdinalIgnoreCase);
	}
}
