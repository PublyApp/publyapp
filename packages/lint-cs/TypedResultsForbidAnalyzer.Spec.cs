using System.Collections.Immutable;
using System.Globalization;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Diagnostics;
using Microsoft.CodeAnalysis.Testing;
using Xunit;
using AnalyzerUnderTest = PublyApp.Analyzers.TypedResultsForbidAnalyzer;
using Verifier =
	Microsoft.CodeAnalysis.CSharp.Testing.CSharpAnalyzerVerifier<
		PublyApp.Analyzers.TypedResultsForbidAnalyzer,
		Microsoft.CodeAnalysis.Testing.DefaultVerifier>;

namespace PublyApp.Analyzers;

public sealed class TypedResultsForbidAnalyzerSpec
{
	// PUBLY0009 ships disabled-by-default, so the test harness must explicitly enable it via an
	// .editorconfig entry before the analyzer will surface any diagnostic.
	private const string EnableConfig = """
		root = true

		[*.cs]
		dotnet_diagnostic.PUBLY0009.severity = warning
		""";

	// The descriptor carries no format arguments, so the produced message is identical to its
	// MessageFormat literal in DiagnosticCatalog.cs. Kept here so message assertions stay in
	// lockstep with the descriptor.
	private const string ExpectedMessage =
		"Do not use 'TypedResults.Forbid()'; use 'TypedProblems.*' (RFC 7807) instead";

	// Minimal stubs so fixtures compile without ASP.NET Core references; the analyzer matches
	// syntactically on the `TypedResults` type and `Forbid` member name.
	private const string ResultStubs = """
		namespace Microsoft.AspNetCore.Http
		{
			public interface IResult { }

			public static class TypedResults
			{
				public static IResult Forbid() => null!;
				public static IResult Ok() => null!;
			}
		}

		namespace Sample
		{
			public static class TypedProblems
			{
				public static Microsoft.AspNetCore.Http.IResult Forbidden() => null!;
			}
		}
		""";

	[Fact]
	public async Task ItShouldReportDiagnosticWhenTypedResultsForbidIsCalled()
	{
		const string source = """
			using Microsoft.AspNetCore.Http;

			namespace Sample;

			public sealed class Example
			{
				public IResult Handle()
				{
					return TypedResults.{|#0:Forbid|}();
				}
			}
			""";

		await VerifyEnabledAsync(source, ExpectedAt(0));
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenFullyQualifiedTypedResultsForbidIsCalled()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public Microsoft.AspNetCore.Http.IResult Handle()
				{
					return Microsoft.AspNetCore.Http.TypedResults.{|#0:Forbid|}();
				}
			}
			""";

		await VerifyEnabledAsync(source, ExpectedAt(0));
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenTypedProblemsHelperIsUsed()
	{
		const string source = """
			using Microsoft.AspNetCore.Http;

			namespace Sample;

			public sealed class Example
			{
				public IResult Handle()
				{
					return TypedProblems.Forbidden();
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenTypedResultsNonForbidResultIsUsed()
	{
		const string source = """
			using Microsoft.AspNetCore.Http;

			namespace Sample;

			public sealed class Example
			{
				public IResult Handle()
				{
					return TypedResults.Ok();
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenForbidIsCalledOnUnrelatedType()
	{
		const string source = """
			namespace Sample;

			public sealed class Authorizer
			{
				public bool Forbid() => true;

				public bool Handle()
				{
					return Forbid();
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenCodeIsGenerated()
	{
		const string source = """
			using Microsoft.AspNetCore.Http;
			using System.CodeDom.Compiler;

			namespace Sample;

			[GeneratedCode("Tool", "1.0.0")]
			public sealed class GeneratedExample
			{
				public IResult Handle()
				{
					return TypedResults.Forbid();
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
		// stay silent even though the source clearly calls TypedResults.Forbid().
		const string source = """
			using Microsoft.AspNetCore.Http;

			namespace Sample;

			public sealed class Example
			{
				public IResult Handle()
				{
					return TypedResults.Forbid();
				}
			}
			""";

		var compilation = CSharpCompilation.Create(
			"DefaultOffAssembly",
			[
				CSharpSyntaxTree.ParseText(source),
				CSharpSyntaxTree.ParseText(ResultStubs),
			],
			[
				MetadataReference.CreateFromFile(typeof(object).Assembly.Location),
			],
			new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

		var analyzers = ImmutableArray.Create<DiagnosticAnalyzer>(new AnalyzerUnderTest());
		var withAnalyzers = compilation.WithAnalyzers(analyzers);

		var diagnostics = await withAnalyzers.GetAnalyzerDiagnosticsAsync();

		Assert.DoesNotContain(diagnostics, diagnostic => diagnostic.Id == DiagnosticIds.PUBLY0009);
	}

	[Fact]
	public void ItShouldExposeTypedResultsForbidDiagnosticMetadata()
	{
		var analyzer = new AnalyzerUnderTest();

		var descriptor = Assert.Single(analyzer.SupportedDiagnostics);

		Assert.Equal(DiagnosticIds.PUBLY0009, descriptor.Id);
		Assert.Equal(
			"Avoid TypedResults.Forbid()",
			descriptor.Title.ToString(CultureInfo.InvariantCulture)
		);
		Assert.Equal("PublyApp.ErrorHandling", descriptor.Category);
		Assert.Equal(DiagnosticSeverity.Warning, descriptor.DefaultSeverity);
		Assert.False(descriptor.IsEnabledByDefault);
	}

	private static DiagnosticResult ExpectedAt(int marker)
	{
		return Verifier
			.Diagnostic(DiagnosticIds.PUBLY0009)
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

		test.TestState.Sources.Add(("ResultStubs.cs", ResultStubs));
		test.TestState.AnalyzerConfigFiles.Add(("/.editorconfig", EnableConfig));
		test.ExpectedDiagnostics.AddRange(expected);

		await test.RunAsync();
	}
}
