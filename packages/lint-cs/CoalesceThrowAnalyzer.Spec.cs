using System.Collections.Immutable;
using System.Globalization;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Diagnostics;
using Microsoft.CodeAnalysis.Testing;
using Xunit;
using AnalyzerUnderTest = PublyApp.Analyzers.CoalesceThrowAnalyzer;
using Verifier =
	Microsoft.CodeAnalysis.CSharp.Testing.CSharpAnalyzerVerifier<
		PublyApp.Analyzers.CoalesceThrowAnalyzer,
		Microsoft.CodeAnalysis.Testing.DefaultVerifier>;

namespace PublyApp.Analyzers;

public sealed class CoalesceThrowAnalyzerSpec
{
	// PUBLY0002 ships disabled-by-default, so the test harness must explicitly enable it via an
	// .editorconfig entry before the analyzer will surface any diagnostic.
	private const string EnableConfig = """
		root = true

		[*.cs]
		dotnet_diagnostic.PUBLY0002.severity = warning
		""";

	// The descriptor carries no format arguments, so the produced message is identical to its
	// MessageFormat literal in DiagnosticCatalog.cs. Kept here so message assertions stay in
	// lockstep with the descriptor.
	private const string ExpectedMessage =
		"Do not use '?? throw'; use an explicit if guard clause for null-then-throw patterns";

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenCoalescingToNonThrowExpressions()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public string ReadDefault(string? value, string defaultValue)
				{
					return value ?? defaultValue;
				}

				public string? ReadNull(string? value)
				{
					return value ?? null;
				}

				public object ReadNew(object? value)
				{
					return value ?? new object();
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenCoalescingToArgumentNullException()
	{
		const string source = """
			using System;

			namespace Sample;

			public sealed class Example
			{
				public string Read(string? value)
				{
					return value {|#0:??|} throw new ArgumentNullException(nameof(value));
				}
			}
			""";

		await VerifyEnabledAsync(source, ExpectedAt(0));
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenCoalescingToInvalidOperationException()
	{
		const string source = """
			using System;

			namespace Sample;

			public sealed class Example
			{
				public string Read(string? value)
				{
					var resolved = value {|#0:??|} throw new InvalidOperationException();

					return resolved;
				}
			}
			""";

		await VerifyEnabledAsync(source, ExpectedAt(0));
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenExpressionBodiedMemberUsesCoalesceThrow()
	{
		const string source = """
			using System;

			namespace Sample;

			public sealed class Example
			{
				private string? _name;

				public string Name => _name {|#0:??|} throw new InvalidOperationException();
			}
			""";

		await VerifyEnabledAsync(source, ExpectedAt(0));
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenAwaitedValueUsesCoalesceThrow()
	{
		const string source = """
			using System;
			using System.Threading.Tasks;

			namespace Sample;

			public sealed class Example
			{
				public async Task<string> Read(Task<string?> valueTask)
				{
					return await valueTask {|#0:??|} throw new InvalidOperationException();
				}
			}
			""";

		await VerifyEnabledAsync(source, ExpectedAt(0));
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenCoalesceThrowIsUsedAsMethodArgument()
	{
		const string source = """
			using System;

			namespace Sample;

			public sealed class Example
			{
				public string Read(string? value)
				{
					return Format(value {|#0:??|} throw new ArgumentNullException(nameof(value)));
				}

				private static string Format(string value)
				{
					return value;
				}
			}
			""";

		await VerifyEnabledAsync(source, ExpectedAt(0));
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenCoalesceAssignmentOperatorIsUsed()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public string Read(string? value)
				{
					value ??= string.Empty;

					return value;
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenBareThrowStatementIsUsed()
	{
		const string source = """
			using System;

			namespace Sample;

			public sealed class Example
			{
				public void Read()
				{
					try
					{
						throw new InvalidOperationException();
					}
					catch (InvalidOperationException)
					{
						throw;
					}
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenExpressionBodiedMemberReturnsValue()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				private string? _name;

				public string? Name => _name;
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenCodeIsGenerated()
	{
		const string source = """
			using System;
			using System.CodeDom.Compiler;

			namespace Sample;

			[GeneratedCode("Tool", "1.0.0")]
			public sealed class GeneratedExample
			{
				public string Read(string? value)
				{
					return value ?? throw new ArgumentNullException(nameof(value));
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenSourceFileHasGeneratedDotGSuffix()
	{
		// Roslyn treats `*.g.cs` files as generated by file-name convention, so the analyzer must
		// stay silent even though the source clearly uses the coalesce-throw pattern.
		const string source = """
			using System;

			namespace Sample;

			public sealed class GeneratedExample
			{
				public string Read(string? value)
				{
					return value ?? throw new ArgumentNullException(nameof(value));
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
			using System;

			namespace Sample;

			public sealed class DesignerExample
			{
				public string Read(string? value)
				{
					return value ?? throw new ArgumentNullException(nameof(value));
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
		// stay silent even though the source clearly uses the coalesce-throw pattern.
		const string source = """
			using System;

			namespace Sample;

			public sealed class Example
			{
				public string Read(string? value)
				{
					return value ?? throw new ArgumentNullException(nameof(value));
				}
			}
			""";

		var compilation = CSharpCompilation.Create(
			"DefaultOffAssembly",
			[CSharpSyntaxTree.ParseText(source)],
			[
				MetadataReference.CreateFromFile(typeof(object).Assembly.Location),
				MetadataReference.CreateFromFile(typeof(ArgumentNullException).Assembly.Location),
			],
			new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

		var analyzers = ImmutableArray.Create<DiagnosticAnalyzer>(new AnalyzerUnderTest());
		var withAnalyzers = compilation.WithAnalyzers(analyzers);

		var diagnostics = await withAnalyzers.GetAnalyzerDiagnosticsAsync();

		Assert.DoesNotContain(diagnostics, diagnostic => diagnostic.Id == DiagnosticIds.PUBLY0002);
	}

	[Fact]
	public void ItShouldExposeCoalesceThrowDiagnosticMetadata()
	{
		var analyzer = new AnalyzerUnderTest();

		var descriptor = Assert.Single(analyzer.SupportedDiagnostics);

		Assert.Equal(DiagnosticIds.PUBLY0002, descriptor.Id);
		Assert.Equal(
			"Avoid null-coalescing throw expressions",
			descriptor.Title.ToString(CultureInfo.InvariantCulture)
		);
		Assert.Equal("PublyApp.Nullability", descriptor.Category);
		Assert.Equal(DiagnosticSeverity.Warning, descriptor.DefaultSeverity);
		Assert.False(descriptor.IsEnabledByDefault);
	}

	private static DiagnosticResult ExpectedAt(int marker)
	{
		return Verifier
			.Diagnostic(DiagnosticIds.PUBLY0002)
			.WithLocation(marker)
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
		// Name the source file so Roslyn's generated-code-by-file-name heuristic applies; the
		// analyzer opts out of generated code, so no PUBLY0002 is expected even with the rule enabled.
		var test = new CSharpAnalyzerTest<AnalyzerUnderTest, DefaultVerifier>();

		test.TestState.Sources.Add((fileName, source));
		test.TestState.AnalyzerConfigFiles.Add(("/.editorconfig", EnableConfig));

		await test.RunAsync();
	}
}
