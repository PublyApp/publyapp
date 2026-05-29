using System.Collections.Immutable;
using System.Globalization;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Diagnostics;
using Microsoft.CodeAnalysis.Testing;
using Xunit;
using AnalyzerUnderTest = PublyApp.Analyzers.ToLowerForComparisonAnalyzer;
using Verifier =
	Microsoft.CodeAnalysis.CSharp.Testing.CSharpAnalyzerVerifier<
		PublyApp.Analyzers.ToLowerForComparisonAnalyzer,
		Microsoft.CodeAnalysis.Testing.DefaultVerifier>;

namespace PublyApp.Analyzers;

public sealed class ToLowerForComparisonAnalyzerSpec
{
	private const string EnableConfig = """
		root = true

		[*.cs]
		dotnet_diagnostic.PUBLY0003.severity = warning
		""";

	private const string ExpectedMessage =
		"Do not use ToLower()/ToLowerInvariant() for comparison or dispatch; use "
		+ "StringComparison overloads or case-insensitive comparers";

	[Fact]
	public async Task ItShouldReportDiagnosticWhenToLowerIsLeftSideOfEquality()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public bool Read(string value)
				{
					return value.{|#0:ToLower|}() == "x";
				}
			}
			""";

		await VerifyEnabledAsync(source, ExpectedDiagnostic(0));
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenToLowerInvariantIsLeftSideOfEquality()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public bool Read(string value)
				{
					return value.{|#0:ToLowerInvariant|}() == "x";
				}
			}
			""";

		await VerifyEnabledAsync(source, ExpectedDiagnostic(0));
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenToLowerIsRightSideOfEquality()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public bool Read(string value)
				{
					return "x" == value.{|#0:ToLower|}();
				}
			}
			""";

		await VerifyEnabledAsync(source, ExpectedDiagnostic(0));
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenToLowerFeedsEquals()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public bool Read(string value)
				{
					return value.{|#0:ToLower|}().Equals("x");
				}
			}
			""";

		await VerifyEnabledAsync(source, ExpectedDiagnostic(0));
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenToLowerFeedsContains()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public bool Read(string value)
				{
					return value.{|#0:ToLower|}().Contains("x");
				}
			}
			""";

		await VerifyEnabledAsync(source, ExpectedDiagnostic(0));
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenToLowerFeedsStartsWith()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public bool Read(string value)
				{
					return value.{|#0:ToLower|}().StartsWith("prefix");
				}
			}
			""";

		await VerifyEnabledAsync(source, ExpectedDiagnostic(0));
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenToLowerFeedsEndsWith()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public bool Read(string value)
				{
					return value.{|#0:ToLower|}().EndsWith("suffix");
				}
			}
			""";

		await VerifyEnabledAsync(source, ExpectedDiagnostic(0));
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenToLowerFeedsIndexOf()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public int Read(string value)
				{
					return value.{|#0:ToLower|}().IndexOf("sub");
				}
			}
			""";

		await VerifyEnabledAsync(source, ExpectedDiagnostic(0));
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenToLowerIsUsedForDisplay()
	{
		const string source = """
			namespace Sample;

			public sealed class Log
			{
				public void Write(string value)
				{
				}
			}

			public sealed class Example
			{
				public void Read(Log log, string value)
				{
					log.Write(value.ToLower());
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenToLowerIsAssigned()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public string Read(string value)
				{
					var x = value.ToLower();
					return x;
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenToLowerIsReturned()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public string Read(string value)
				{
					return value.ToLower();
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenToLowerIsUsedInStringInterpolation()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public string Read(string value)
				{
					return $"{value.ToLower()}-suffix";
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenSourceFileHasGeneratedDotGSuffix()
	{
		// Roslyn treats `*.g.cs` files as generated by file-name convention, so the analyzer must stay
		// silent even though the source clearly uses ToLower() for comparison.
		const string source = """
			namespace Sample;

			public sealed class GeneratedExample
			{
				public bool Read(string value)
				{
					return value.ToLower() == "x";
				}
			}
			""";

		await VerifyEnabledWithFileNameAsync("GeneratedExample.g.cs", source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenSourceFileHasDesignerSuffix()
	{
		// `*.designer.cs` is another file-name convention Roslyn classifies as generated code.
		const string source = """
			namespace Sample;

			public sealed class DesignerExample
			{
				public bool Read(string value)
				{
					return value.ToLower() == "x";
				}
			}
			""";

		await VerifyEnabledWithFileNameAsync("DesignerExample.designer.cs", source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenRuleIsDisabledByDefault()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public bool Read(string value)
				{
					return value.ToLower() == "x";
				}
			}
			""";

		var compilation = CSharpCompilation.Create(
			"DefaultOffAssembly",
			[CSharpSyntaxTree.ParseText(source)],
			[MetadataReference.CreateFromFile(typeof(object).Assembly.Location)],
			new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

		var analyzers = ImmutableArray.Create<DiagnosticAnalyzer>(new AnalyzerUnderTest());
		var withAnalyzers = compilation.WithAnalyzers(analyzers);

		var diagnostics = await withAnalyzers.GetAnalyzerDiagnosticsAsync();

		Assert.DoesNotContain(diagnostics, diagnostic => diagnostic.Id == DiagnosticIds.PUBLY0003);
	}

	[Fact]
	public void ItShouldExposeToLowerForComparisonDiagnosticMetadata()
	{
		var analyzer = new AnalyzerUnderTest();

		var descriptor = Assert.Single(analyzer.SupportedDiagnostics);

		Assert.Equal("PUBLY0003", descriptor.Id);
		Assert.Equal(
			"Avoid ToLower() for comparison or dispatch",
			descriptor.Title.ToString(CultureInfo.InvariantCulture)
		);
		Assert.Equal("PublyApp.Comparison", descriptor.Category);
		Assert.Equal(DiagnosticSeverity.Warning, descriptor.DefaultSeverity);
		Assert.False(descriptor.IsEnabledByDefault);
	}

	private static DiagnosticResult ExpectedDiagnostic(int location)
	{
		return Verifier
			.Diagnostic(DiagnosticIds.PUBLY0003)
			.WithLocation(location)
			.WithMessage(ExpectedMessage);
	}

	private static async Task VerifyEnabledAsync(
		string source,
		params DiagnosticResult[] expected)
	{
		var test = new CSharpAnalyzerTest<AnalyzerUnderTest, DefaultVerifier>
		{
			TestCode = source,
		};

		test.TestState.AnalyzerConfigFiles.Add(("/.editorconfig", EnableConfig));
		test.ExpectedDiagnostics.AddRange(expected);

		await test.RunAsync();
	}

	private static async Task VerifyEnabledWithFileNameAsync(string fileName, string source)
	{
		// Name the source file so Roslyn's generated-code-by-file-name heuristic applies; the analyzer
		// opts out of generated code, so no PUBLY0003 is expected even with the rule enabled.
		var test = new CSharpAnalyzerTest<AnalyzerUnderTest, DefaultVerifier>();

		test.TestState.Sources.Add((fileName, source));
		test.TestState.AnalyzerConfigFiles.Add(("/.editorconfig", EnableConfig));

		await test.RunAsync();
	}
}
