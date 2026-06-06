using System.Collections.Immutable;
using System.Globalization;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Diagnostics;
using Microsoft.CodeAnalysis.Testing;
using Xunit;
using AnalyzerUnderTest = PublyApp.Analyzers.EqualityNullCheckAnalyzer;
using Verifier =
	Microsoft.CodeAnalysis.CSharp.Testing.CSharpAnalyzerVerifier<
		PublyApp.Analyzers.EqualityNullCheckAnalyzer,
		Microsoft.CodeAnalysis.Testing.DefaultVerifier>;

namespace PublyApp.Analyzers;

public sealed class EqualityNullCheckAnalyzerSpec
{
	private const string EnableConfig = """
		root = true

		[*.cs]
		dotnet_diagnostic.PUBLY0008.severity = warning
		""";

	private const string ExpectedMessage =
		"Use 'is null' / 'is not null' pattern matching instead of direct null equality checks";

	[Fact]
	public async Task ItShouldReportDiagnosticWhenVariableEqualsNull()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public bool Read(string? value)
				{
					return value {|#0:==|} null;
				}
			}
			""";

		await VerifyEnabledAsync(source, ExpectedDiagnostic(0));
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenNullNotEqualsVariable()
	{
		const string source = """
			using System;

			namespace Sample;

			public sealed class Example
			{
				public bool Read(string? value)
				{
					return null {|#0:!=|} value;
				}
			}
			""";

		await VerifyEnabledAsync(source, ExpectedDiagnostic(0));
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenIsPatternMatch()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public bool Read(string? value)
				{
					return value is null;
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenIsNotPatternMatch()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public bool Read(string? value)
				{
					return value is not null;
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenNeitherOperandIsNull()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public bool Read(int left, int right)
				{
					return left == right;
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenNullEqualityIsInsideExpressionTreeLambda()
	{
		const string source = """
			using System;
			using System.Linq.Expressions;

			namespace Sample;

			public sealed class Example
			{
				public bool Read()
				{
					return Matches(x => x.Foo == null);
				}

				private static bool Matches(Expression<Func<Sample, bool>> predicate)
				{
					return true;
				}
			}

			public sealed class Sample
			{
				public string? Foo { get; set; }
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenNullEqualityIsInsideDelegateLambda()
	{
		const string source = """
			using System;

			namespace Sample;

			public sealed class Example
			{
				public bool Read()
				{
					return Matches(x => x.Foo {|#0:==|} null);
				}

				private static bool Matches(Func<Sample, bool> predicate)
				{
					return true;
				}
			}

			public sealed class Sample
			{
				public string? Foo { get; set; }
			}
			""";

		await VerifyEnabledAsync(source, ExpectedDiagnostic(0));
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenUserDefinedEqualityOperatorIsInvolvedWithEquals()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public bool Read()
				{
					return new Value("a") {|#0:==|} null;
				}
			}

			public sealed class Value
			{
				private readonly string _value;

				public Value(string value)
				{
					_value = value;
				}

				public static bool operator ==(Value left, Value right)
				{
					if (ReferenceEquals(left, null)) return ReferenceEquals(right, null);
					if (ReferenceEquals(right, null)) return false;

					return left._value == right._value;
				}

				public static bool operator !=(Value left, Value right)
				{
					return !(left == right);
				}

				public override bool Equals(object? obj)
				{
					return obj is Value other && this == other;
				}

				public override int GetHashCode()
				{
					return _value.GetHashCode();
				}
			}
			""";

			await VerifyEnabledAsync(source, ExpectedDiagnostic(0));
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenUserDefinedEqualityOperatorIsInvolvedWithNotEquals()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public bool Read()
				{
					return new Value("a") {|#0:!=|} null;
				}
			}

			public sealed class Value
			{
				private readonly string _value;

				public Value(string value)
				{
					_value = value;
				}

				public static bool operator ==(Value left, Value right)
				{
					if (ReferenceEquals(left, null)) return ReferenceEquals(right, null);
					if (ReferenceEquals(right, null)) return false;

					return left._value == right._value;
				}

				public static bool operator !=(Value left, Value right)
				{
					return !(left == right);
				}

				public override bool Equals(object? obj)
				{
					return obj is Value other && this == other;
				}

				public override int GetHashCode()
				{
					return _value.GetHashCode();
				}
			}
			""";

		await VerifyEnabledAsync(source, ExpectedDiagnostic(0));
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenRuleUsesGeneratedFileSuffix()
	{
		const string source = """
			namespace Sample;

			public sealed class GeneratedExample
			{
				public bool Read(string value)
				{
					return value == null;
				}
			}
			""";

		await VerifyEnabledWithFileNameAsync("GeneratedExample.designer.cs", source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenRuleIsDisabledByDefault()
	{
		const string source = """
			namespace Sample;

			public sealed class Example
			{
				public bool Read(string? value)
				{
					return value == null;
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

		Assert.DoesNotContain(diagnostics, diagnostic => diagnostic.Id == DiagnosticIds.PUBLY0008);
	}

	[Fact]
	public void ItShouldExposeEqualityNullCheckDiagnosticMetadata()
	{
		var analyzer = new AnalyzerUnderTest();

		var descriptor = Assert.Single(analyzer.SupportedDiagnostics);

		Assert.Equal(DiagnosticIds.PUBLY0008, descriptor.Id);
		Assert.Equal(
			"Use pattern matching for null checks",
			descriptor.Title.ToString(CultureInfo.InvariantCulture)
		);
		Assert.Equal("PublyApp.Nullability", descriptor.Category);
		Assert.Equal(DiagnosticSeverity.Hidden, descriptor.DefaultSeverity);
		Assert.False(descriptor.IsEnabledByDefault);
	}

	private static DiagnosticResult ExpectedDiagnostic(int location)
	{
		return Verifier
			.Diagnostic(DiagnosticIds.PUBLY0008)
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
		var test = new CSharpAnalyzerTest<AnalyzerUnderTest, DefaultVerifier>();

		test.TestState.Sources.Add((fileName, source));
		test.TestState.AnalyzerConfigFiles.Add(("/.editorconfig", EnableConfig));
		await test.RunAsync();
	}
}
