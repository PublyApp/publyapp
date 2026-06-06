using System.Collections.Immutable;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;
using Microsoft.CodeAnalysis.Operations;

namespace PublyApp.Analyzers;

/// <summary>
/// PUBLY0007 — requires staff handlers to call service variants that include <c>ForStaff</c> when
/// available, ensuring staff handlers do not call base methods that assume tenant filtering.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class StaffHandlerServiceVariantAnalyzer : DiagnosticAnalyzer {
	public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics {
		get { return ImmutableArray.Create(DiagnosticCatalog.StaffHandlerServiceVariant); }
	}

	public override void Initialize(AnalysisContext context) {
		context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
		context.EnableConcurrentExecution();
		context.RegisterOperationAction(AnalyzeInvocation, OperationKind.Invocation);
	}

	private static void AnalyzeInvocation(OperationAnalysisContext context) {
		if (context.Operation is not IInvocationOperation invocation) {
			return;
		}

		var filePath = invocation.Syntax.SyntaxTree?.FilePath;
		if (!IsStaffHandlerFile(filePath)) {
			return;
		}

		if (invocation.TargetMethod is null) {
			return;
		}

		var method = invocation.TargetMethod;
		var methodName = method.Name;
		if (methodName.Contains("ForStaff", StringComparison.Ordinal)) {
			return;
		}

		var staffVariantName = GetStaffVariantName(methodName);
		if (method.ContainingType is null) {
			return;
		}

		if (!IsDomainServiceType(method.ContainingType)) {
			return;
		}

		if (!HasForStaffVariant(method.ContainingType, method, staffVariantName)) {
			return;
		}

		var location = GetInvocationTargetLocation(invocation.Syntax as InvocationExpressionSyntax)
			?? invocation.Syntax.GetLocation();
		var diagnostic = Diagnostic.Create(DiagnosticCatalog.StaffHandlerServiceVariant, location);

		context.ReportDiagnostic(diagnostic);
	}

	private static bool IsStaffHandlerFile(string? filePath) {
		if (string.IsNullOrEmpty(filePath)) {
			return false;
		}

		var normalizedPath = (filePath ?? string.Empty).Replace('\\', '/');
		return normalizedPath.Contains("/Handlers/Staff/", StringComparison.Ordinal);
	}

	private static string GetStaffVariantName(string methodName) {
		const string asyncSuffix = "Async";
		return methodName.EndsWith(asyncSuffix, StringComparison.Ordinal)
			? methodName.Substring(0, methodName.Length - asyncSuffix.Length)
				+ "ForStaffAsync"
			: methodName + "ForStaff";
	}

	private static bool IsDomainServiceType(INamedTypeSymbol containingType) {
		var typeName = containingType.Name;
		return typeName.EndsWith("Service", StringComparison.Ordinal);
	}

	private static bool HasForStaffVariant(
		INamedTypeSymbol? containingType,
		IMethodSymbol method,
		string staffVariantName
	) {
		if (containingType is null) {
			return false;
		}

		foreach (var member in containingType.GetMembers(staffVariantName)) {
			if (member is not IMethodSymbol staffMethod) {
				continue;
			}

			if (staffMethod.IsStatic != method.IsStatic) {
				continue;
			}

			if (staffMethod.Parameters.Length != method.Parameters.Length) {
				continue;
			}

			if (staffMethod.TypeParameters.Length != method.TypeParameters.Length) {
				continue;
			}

			if (staffMethod.TypeParameters.Length != method.TypeArguments.Length) {
				continue;
			}

			if (member.Name != staffVariantName) {
				continue;
			}

			var comparisonMethod = ConstructWithTypeArguments(staffMethod, method);
			if (HasMatchingParameterSignature(comparisonMethod, method)) {
				return true;
			}
		}

		return false;
	}

	private static IMethodSymbol ConstructWithTypeArguments(
		IMethodSymbol staffMethod,
		IMethodSymbol method
	) {
		if (staffMethod.TypeParameters.Length == 0) {
			return staffMethod;
		}

		var typeArguments = new ITypeSymbol[method.TypeArguments.Length];
		for (var i = 0; i < method.TypeArguments.Length; i++) {
			typeArguments[i] = method.TypeArguments[i];
		}

		return staffMethod.Construct(typeArguments);
	}

	private static bool HasMatchingParameterSignature(
		IMethodSymbol staffMethod,
		IMethodSymbol method
	) {
		for (var i = 0; i < staffMethod.Parameters.Length; i++) {
			var staffParameter = staffMethod.Parameters[i];
			var methodParameter = method.Parameters[i];

			if (staffParameter.RefKind != methodParameter.RefKind) {
				return false;
			}

			if (!SymbolEqualityComparer.Default.Equals(staffParameter.Type, methodParameter.Type)) {
				return false;
			}
		}

		return true;
	}

	private static Location? GetInvocationTargetLocation(InvocationExpressionSyntax? invocation) {
		if (invocation is null) {
			return null;
		}

		return invocation.Expression switch {
			MemberAccessExpressionSyntax memberAccess => memberAccess.Name.GetLocation(),
			MemberBindingExpressionSyntax memberBinding => memberBinding.Name.GetLocation(),
			IdentifierNameSyntax identifier => identifier.GetLocation(),
			GenericNameSyntax genericName => genericName.GetLocation(),
			_ => invocation.GetLocation(),
		};
	}
}
