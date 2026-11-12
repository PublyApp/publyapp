using FluentAssertions;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// Provider limits live in <c>ProviderCapabilityRegistry</c> and nowhere else (#2173, #2184):
/// publish validation code reads them from the capability it is handed, so a limit cannot
/// drift into a second, forgotten copy. The guard parses every publishing validation source
/// file (Roslyn, so comments and strings never count) and refuses any numeric literal other
/// than 0 and 1, the structural values every counter and index needs.
/// Non-vacuous: <see cref="ItShouldFlagAPlantedLimitLiteral"/> runs the same scanner over
/// planted code, and the discovery test pins that the real validation files are scanned.
/// </summary>
public sealed class CapabilityLimitLiteralGuardSpec {
	private static readonly string[] _StructuralLiterals = ["0", "1"];

	internal static IReadOnlyList<string> FindLimitLiterals(string source) {
		var root = CSharpSyntaxTree.ParseText(source).GetRoot();
		return root.DescendantNodes()
			.OfType<LiteralExpressionSyntax>()
			.Where(literal => literal.IsKind(SyntaxKind.NumericLiteralExpression))
			.Where(literal => !CapabilityLimitLiteralGuardSpec._StructuralLiterals.Contains(literal.Token.Text))
			.Select(literal => $"line {literal.GetLocation().GetLineSpan().StartLinePosition.Line + 1}: {literal.Token.Text}")
			.ToList();
	}

	private static DirectoryInfo _PublishingDirectory() {
		var directory = new DirectoryInfo(AppContext.BaseDirectory);
		while (directory is not null) {
			var candidate = Path.Combine(directory.FullName, "apps", "api", "Modules", "Publishing");
			if (Directory.Exists(candidate)) {
				return new DirectoryInfo(candidate);
			}

			directory = directory.Parent;
		}

		throw new InvalidOperationException(
			"Could not locate apps/api/Modules/Publishing above the test output directory."
		);
	}

	// Validation code: any non-spec source whose name says Validation, plus the mapper that
	// turns a failure into a problem. The registry itself is the one allowed home of limits.
	private static IReadOnlyList<FileInfo> _ValidationFiles() {
		return CapabilityLimitLiteralGuardSpec._PublishingDirectory()
			.EnumerateFiles("*.cs", SearchOption.AllDirectories)
			.Where(file => !file.Name.EndsWith(".Spec.cs", StringComparison.Ordinal))
			.Where(file => file.Name.Contains("Validation", StringComparison.Ordinal)
				|| file.Name == "PublishContentProblems.cs")
			.ToList();
	}

	[Fact]
	public void ItShouldScanThePublishValidationService() {
		CapabilityLimitLiteralGuardSpec._ValidationFiles().Select(file => file.Name)
			.Should().Contain("PublishValidationService.cs");
	}

	[Fact]
	public void ItShouldKeepNumericLimitLiteralsOutOfValidationCode() {
		var offenders = CapabilityLimitLiteralGuardSpec._ValidationFiles()
			.SelectMany(file => CapabilityLimitLiteralGuardSpec.FindLimitLiterals(File.ReadAllText(file.FullName))
				.Select(hit => $"{file.Name} {hit}"))
			.ToList();

		offenders.Should().BeEmpty(
			"limits belong in ProviderCapabilityRegistry; validation code reads them from the capability"
		);
	}

	[Fact]
	public void ItShouldFlagAPlantedLimitLiteral() {
		const string planted = """
			public static class Planted {
				private const int MaxGraphemes = 300;
				public static bool TooLong(int count) { return count > 3000; }
				public static bool Fine(int count) { return count == 0 || count + 1 > 1; }
				// 500 in a comment and "600" in a string never count
				public static string S = "600";
			}
			""";

		CapabilityLimitLiteralGuardSpec.FindLimitLiterals(planted).Should().Equal("line 2: 300", "line 3: 3000");
	}
}
