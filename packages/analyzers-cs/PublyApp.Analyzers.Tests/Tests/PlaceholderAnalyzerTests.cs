using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Diagnostics;
using Microsoft.CodeAnalysis.Testing;
using Xunit;
using AnalyzerUnderTest = PublyApp.Analyzers.PlaceholderAnalyzer;

namespace PublyApp.Analyzers.Tests.Tests;

public sealed class PlaceholderAnalyzerTests
{
	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenCodeIsValid()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
			}
			""";

		await CSharpAnalyzerVerifier<AnalyzerUnderTest>.VerifyAnalyzerAsync(source);
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
			}
			""";

		await CSharpAnalyzerVerifier<AnalyzerUnderTest>.VerifyAnalyzerAsync(source);
	}

	[Fact]
	public void ItShouldExposePlaceholderDiagnosticMetadata()
	{
		var analyzer = new AnalyzerUnderTest();

		var descriptor = Assert.Single(analyzer.SupportedDiagnostics);

		Assert.Equal("PUBLY0001", descriptor.Id);
		Assert.False(descriptor.IsEnabledByDefault);
	}

	private static class CSharpAnalyzerVerifier<TAnalyzer>
		where TAnalyzer : DiagnosticAnalyzer, new()
	{
		public static async Task VerifyAnalyzerAsync(string source)
		{
			var test = new CSharpAnalyzerTest<TAnalyzer, DefaultVerifier>
			{
				TestCode = source,
			};

			await test.RunAsync();
		}
	}
}
