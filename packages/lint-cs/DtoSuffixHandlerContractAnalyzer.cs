using System.Collections.Immutable;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace PublyApp.Analyzers;

/// <summary>
/// PUBLY0004 — flags handler contract types that keep a Dto suffix in
/// <c>Modules/*/Handlers</c> files. In handler contracts, suffixes like Body, Query,
/// Result, Response, and Item are preferred over Dto.
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class DtoSuffixHandlerContractAnalyzer : DiagnosticAnalyzer {
	public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics {
		get { return ImmutableArray.Create(DiagnosticCatalog.DtoSuffixHandlerContract); }
	}

	public override void Initialize(AnalysisContext context) {
		context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
		context.EnableConcurrentExecution();
		context.RegisterSyntaxNodeAction(
			_AnalyzeTypeDeclaration,
			SyntaxKind.ClassDeclaration,
			SyntaxKind.RecordStructDeclaration,
			SyntaxKind.RecordDeclaration,
			SyntaxKind.StructDeclaration);
	}

	private static void _AnalyzeTypeDeclaration(SyntaxNodeAnalysisContext context) {
		if (context.Node is not TypeDeclarationSyntax typeDeclaration) {
			return;
		}

		var identifier = typeDeclaration.Identifier.Text;
		if (!identifier.EndsWith("Dto", StringComparison.Ordinal)) {
			return;
		}

		if (!_IsInHandlersFolder(context.Node.SyntaxTree.FilePath)) {
			return;
		}

		var diagnostic = Diagnostic.Create(
			DiagnosticCatalog.DtoSuffixHandlerContract,
			typeDeclaration.Identifier.GetLocation());
		context.ReportDiagnostic(diagnostic);
	}

	private static bool _IsInHandlersFolder(string filePath) {
		var normalizedPath = filePath.Replace('\\', '/');

		if (_IsTestFilePath(normalizedPath)) {
			return false;
		}

		return normalizedPath.Contains("/Modules/", StringComparison.OrdinalIgnoreCase)
			&& normalizedPath.Contains("/Handlers/", StringComparison.OrdinalIgnoreCase);
	}

	private static bool _IsTestFilePath(string normalizedPath) {
		return normalizedPath.EndsWith(".Spec.cs", StringComparison.OrdinalIgnoreCase)
			|| normalizedPath.EndsWith(".Specs.cs", StringComparison.OrdinalIgnoreCase)
			|| normalizedPath.EndsWith(".Tests.cs", StringComparison.OrdinalIgnoreCase)
			|| normalizedPath.Contains("/Tests/", StringComparison.OrdinalIgnoreCase)
			|| normalizedPath.Contains("/tests/", StringComparison.OrdinalIgnoreCase);
	}
}
