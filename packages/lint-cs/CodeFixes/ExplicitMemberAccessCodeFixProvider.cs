using System.Collections.Immutable;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CodeActions;
using Microsoft.CodeAnalysis.CodeFixes;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace PublyApp.Analyzers;

[ExportCodeFixProvider(
	LanguageNames.CSharp,
	Name = nameof(ExplicitMemberAccessCodeFixProvider)
)]
public sealed class ExplicitMemberAccessCodeFixProvider : CodeFixProvider {
	public override ImmutableArray<string> FixableDiagnosticIds {
		get { return ImmutableArray.Create(DiagnosticIds.PUBLY0012); }
	}

	public override FixAllProvider GetFixAllProvider() {
		return WellKnownFixAllProviders.BatchFixer;
	}

	public override async Task RegisterCodeFixesAsync(CodeFixContext context) {
		var diagnostic = context.Diagnostics.FirstOrDefault(
			candidate => candidate.Id == DiagnosticIds.PUBLY0012
		);
		if (diagnostic is null) {
			return;
		}

		var root = await context.Document.GetSyntaxRootAsync(context.CancellationToken);
		var semanticModel = await context.Document.GetSemanticModelAsync(
			context.CancellationToken
		);
		if (root is null || semanticModel is null) {
			return;
		}

		var name = root.DescendantNodes()
			.OfType<SimpleNameSyntax>()
			.FirstOrDefault(candidate =>
				candidate.Identifier.Span == diagnostic.Location.SourceSpan
			);
		if (name is null) {
			return;
		}
		var info = ExplicitMemberAccessHelper.TryGetInfo(
			name,
			semanticModel,
			context.CancellationToken
		);
		if (info is null) {
			return;
		}
		var replacement = ExplicitMemberAccessHelper.CreateReplacement(
			name,
			info,
			semanticModel
		);
		if (replacement is null) {
			return;
		}

		var changedRoot = root.ReplaceNode(name, replacement);
		var changedDocument = context.Document.WithSyntaxRoot(changedRoot);

		context.RegisterCodeFix(
			CodeAction.Create(
				"Qualify member access",
				_ => Task.FromResult(changedDocument),
				nameof(ExplicitMemberAccessCodeFixProvider)
			),
			diagnostic
		);
	}
}
