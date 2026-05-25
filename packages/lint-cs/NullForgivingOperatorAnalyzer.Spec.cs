using System.Collections.Immutable;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Diagnostics;
using Microsoft.CodeAnalysis.Testing;
using Xunit;
using AnalyzerUnderTest = PublyApp.Analyzers.NullForgivingOperatorAnalyzer;
using Verifier =
	Microsoft.CodeAnalysis.CSharp.Testing.CSharpAnalyzerVerifier<
		PublyApp.Analyzers.NullForgivingOperatorAnalyzer,
		Microsoft.CodeAnalysis.Testing.DefaultVerifier>;

namespace PublyApp.Analyzers;

public sealed class NullForgivingOperatorAnalyzerSpec
{
	// PUBLY0001 ships disabled-by-default, so the test harness must explicitly enable it via an
	// .editorconfig entry before the analyzer will surface any diagnostic.
	private const string EnableConfig = """
		root = true

		[*.cs]
		dotnet_diagnostic.PUBLY0001.severity = warning
		""";

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenNoNullForgivingOperatorIsUsed()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public string Read(string? value)
				{
					if (value is null)
					{
						return string.Empty;
					}

					return value;
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenNullForgivingOperatorIsUsed()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public string Read(string? value)
				{
					return value{|#0:!|};
				}
			}
			""";

		var expected = Verifier
			.Diagnostic(DiagnosticIds.PUBLY0001)
			.WithLocation(0);

		await VerifyEnabledAsync(source, expected);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenCodeIsGenerated()
	{
		const string source = """
			using System.CodeDom.Compiler;

			namespace Sample;

			[GeneratedCode("Tool", "1.0.0")]
			public sealed class GeneratedExample
			{
				public string Read(string? value)
				{
					return value!;
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenRuleIsDisabledByDefault()
	{
		// The Microsoft.CodeAnalysis.Testing harness force-enables the analyzer under test, so it
		// cannot model the default-off behavior. Drive a raw Roslyn compilation (no .editorconfig)
		// instead: with isEnabledByDefault: false and no config to turn it on, the analyzer must
		// stay silent even though the source clearly uses the null-forgiving operator.
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public string Read(string? value)
				{
					return value!;
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

		Assert.DoesNotContain(diagnostics, diagnostic => diagnostic.Id == DiagnosticIds.PUBLY0001);
	}

	[Fact]
	public void ItShouldExposeNullForgivingDiagnosticMetadata()
	{
		var analyzer = new AnalyzerUnderTest();

		var descriptor = Assert.Single(analyzer.SupportedDiagnostics);

		Assert.Equal("PUBLY0001", descriptor.Id);
		Assert.False(descriptor.IsEnabledByDefault);
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
}
