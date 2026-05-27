using System.Collections.Immutable;
using System.Globalization;

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

	// The descriptor carries no format arguments, so the produced message is identical to its
	// MessageFormat literal in DiagnosticCatalog.cs. Kept here so message assertions stay in lockstep
	// with the descriptor.
	private const string ExpectedMessage =
		"Do not use the null-forgiving operator '!'; handle null explicitly with a guard clause or "
		+ "a safe accessor";

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
			.WithLocation(0)
			.WithMessage(ExpectedMessage);

		await VerifyEnabledAsync(source, expected);
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenNullForgivingOperatorIsChained()
	{
		// a!.b! — two suppressions, so two diagnostics, each at its own `!` token.
		const string source = """
			namespace Sample;

			public sealed class Node
			{
				public Node? Next;
			}

			public sealed class Example
			{
				public Node Read(Node? value)
				{
					return value{|#0:!|}.Next{|#1:!|};
				}
			}
			""";

		var expected = new[]
		{
			Verifier.Diagnostic(DiagnosticIds.PUBLY0001).WithLocation(0),
			Verifier.Diagnostic(DiagnosticIds.PUBLY0001).WithLocation(1),
		};

		await VerifyEnabledAsync(source, expected);
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenNullForgivingOperatorFollowsIndexer()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public string Read(string?[] values, int i)
				{
					return values[i]{|#0:!|};
				}
			}
			""";

		var expected = Verifier
			.Diagnostic(DiagnosticIds.PUBLY0001)
			.WithLocation(0);

		await VerifyEnabledAsync(source, expected);
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenNullForgivingOperatorFollowsParenthesizedExpression()
	{
		// A bare `(value)!` is parsed as a cast and would not bind; wrap a real expression so the node
		// is an unambiguous parenthesized expression carrying the suppression.
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				private string? Build() => "value";

				public string Read()
				{
					return (Build()){|#0:!|};
				}
			}
			""";

		var expected = Verifier
			.Diagnostic(DiagnosticIds.PUBLY0001)
			.WithLocation(0);

		await VerifyEnabledAsync(source, expected);
	}

	[Fact]
	public async Task ItShouldReportTwoDiagnosticsWhenNullForgivingOperatorIsDoubled()
	{
		// a!! — the redundant double form still parses as two nested suppressions, so the analyzer
		// fires once per `!`. The compiler additionally raises CS8715 (duplicate null suppression) on
		// the inner operand, which the harness requires us to declare.
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public string Read(string? value)
				{
					return {|#2:value|}{|#0:!|}{|#1:!|};
				}
			}
			""";

		var expected = new[]
		{
			Verifier.Diagnostic(DiagnosticIds.PUBLY0001).WithLocation(0),
			Verifier.Diagnostic(DiagnosticIds.PUBLY0001).WithLocation(1),
			DiagnosticResult.CompilerError("CS8715").WithLocation(2),
		};

		await VerifyEnabledAsync(source, expected);
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenNullForgivingOperatorIsUsedInTernary()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public string Read(string? value, bool flag)
				{
					return flag ? value{|#0:!|} : string.Empty;
				}
			}
			""";

		var expected = Verifier
			.Diagnostic(DiagnosticIds.PUBLY0001)
			.WithLocation(0);

		await VerifyEnabledAsync(source, expected);
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenNullForgivingOperatorIsUsedInMethodReturn()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				private string? _value;

				public string Read()
				{
					return _value{|#0:!|};
				}
			}
			""";

		var expected = Verifier
			.Diagnostic(DiagnosticIds.PUBLY0001)
			.WithLocation(0);

		await VerifyEnabledAsync(source, expected);
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenNullForgivingOperatorIsUsedInFieldInitializer()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				private static readonly string? Seed = "seed";

				private readonly string _value = Seed{|#0:!|};
			}
			""";

		var expected = Verifier
			.Diagnostic(DiagnosticIds.PUBLY0001)
			.WithLocation(0);

		await VerifyEnabledAsync(source, expected);
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenNullForgivingOperatorIsUsedInPropertyInitializer()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				private static readonly string? Seed = "seed";

				public string Value { get; } = Seed{|#0:!|};
			}
			""";

		var expected = Verifier
			.Diagnostic(DiagnosticIds.PUBLY0001)
			.WithLocation(0);

		await VerifyEnabledAsync(source, expected);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenLogicalNotOperatorIsUsed()
	{
		// Prefix logical-not `!x` is LogicalNotExpression, a different syntax kind, and must not fire.
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public bool Read(bool value)
				{
					return !value;
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenInequalityOperatorIsUsed()
	{
		// Inequality `x != y` is NotEqualsExpression, a different syntax kind, and must not fire.
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public bool Read(int left, int right)
				{
					return left != right;
				}
			}
			""";

		await VerifyEnabledAsync(source);
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
	public async Task ItShouldReturnNoDiagnosticsWhenSourceFileHasGeneratedDotGSuffix()
	{
		// Roslyn treats `*.g.cs` files as generated by file-name convention, so the analyzer must stay
		// silent even though the source clearly uses the null-forgiving operator.
		const string source = """
			namespace Sample;

			public sealed class GeneratedExample
			{
				public string Read(string? value)
				{
					return value!;
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
				public string Read(string? value)
				{
					return value!;
				}
			}
			""";

		await VerifyEnabledWithFileNameAsync("DesignerExample.designer.cs", source);
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
		Assert.Equal(
			"Avoid the null-forgiving operator",
			descriptor.Title.ToString(CultureInfo.InvariantCulture)
		);
		Assert.Equal("PublyApp.Nullability", descriptor.Category);
		Assert.Equal(DiagnosticSeverity.Warning, descriptor.DefaultSeverity);
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

	private static async Task VerifyEnabledWithFileNameAsync(string fileName, string source)
	{
		// Name the source file so Roslyn's generated-code-by-file-name heuristic applies; the analyzer
		// opts out of generated code, so no PUBLY0001 is expected even with the rule enabled.
		var test = new CSharpAnalyzerTest<AnalyzerUnderTest, DefaultVerifier>();

		test.TestState.Sources.Add((fileName, source));
		test.TestState.AnalyzerConfigFiles.Add(("/.editorconfig", EnableConfig));

		await test.RunAsync();
	}
}
