using System.Globalization;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Testing;
using Xunit;
using AnalyzerUnderTest = PublyApp.Analyzers.UncachedBodyGetterAnalyzer;
using Verifier =
	Microsoft.CodeAnalysis.CSharp.Testing.CSharpAnalyzerVerifier<
		PublyApp.Analyzers.UncachedBodyGetterAnalyzer,
		Microsoft.CodeAnalysis.Testing.DefaultVerifier>;

namespace PublyApp.Analyzers;

public sealed class UncachedBodyGetterAnalyzerSpec
{
	private const string EnableConfig = """
		root = true

		[*.cs]
		dotnet_diagnostic.PUBLY0006.severity = warning
		""";

	private const string ExpectedMessage = "Cache '{0}' to a local variable before reusing it";

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenCachedGetterIsReused()
	{
		const string source = """
			namespace Sample;

			public sealed class Body
			{
				public string GetFirstName()
				{
					return "Ada";
				}
			}

			public sealed class Handler
			{
				public static string Handle(Body body)
				{
					var firstName = body.GetFirstName();
					return firstName;
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenSameGetterIsCalledTwiceWithoutCaching()
	{
		const string source = """
			namespace Sample;

			public sealed class Body
			{
				public string GetFirstName()
				{
					return "Ada";
				}
			}

			public sealed class Handler
			{
				public static string Handle(Body body)
				{
					return {|#0:body.GetFirstName()|} + {|#1:body.GetFirstName()|};
				}
			}
			""";

		var expected = new[]
		{
			ExpectedDiagnostic(0, "body.GetFirstName()"),
			ExpectedDiagnostic(1, "body.GetFirstName()"),
		};

		await VerifyEnabledAsync(source, expected);
	}

	[Fact]
	public async Task ItShouldReportDiagnosticForPatchFieldGetterCalledOnce()
	{
		const string source = """
			using System;

			public readonly struct PatchField<T>
			{
				private readonly T? _value;

				public PatchField(T? value)
				{
					_value = value;
				}
			}

			public sealed class Body
			{
				public PatchField<string?> GetTitle()
				{
					throw new InvalidOperationException();
				}
			}

			public sealed class Handler
			{
				public static PatchField<string?> Handle(Body body)
				{
					return {|#0:body.GetTitle()|};
				}
			}
			""";

		await VerifyEnabledAsync(source, ExpectedDiagnostic(0, "body.GetTitle()"));
	}

	[Fact]
	public async Task ItShouldSkipHandlerShapeChecksOutsideHandleMethodOrPublicSealedType()
	{
		const string source = """
			namespace Sample;

			public class Body
			{
				public string GetFirstName()
				{
					return "Ada";
				}
			}

			public sealed class Handler
			{
				public static string Read(Body body)
				{
					return body.GetFirstName();
				}
			}

			public sealed class ReadOnlyHandler
			{
				public string Handle(Body body)
				{
					return body.GetFirstName() + body.GetFirstName();
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenArgsRecordUsesCachedLocals()
	{
		const string source = """
			namespace Sample;

			public sealed class Body
			{
				public string GetFirstName()
				{
					return "Ada";
				}

				public string GetLastName()
				{
					return "Lovelace";
				}
			}

			public sealed class Args
			{
				public string FirstName { get; }
				public string LastName { get; }

				public Args(string firstName, string lastName)
				{
					FirstName = firstName;
					LastName = lastName;
				}
			}

			public sealed class Handler
			{
				public static string Handle(Body body)
				{
					var firstName = body.GetFirstName();
					var lastName = body.GetLastName();
					var args = new Args(firstName, lastName);
					return args.FirstName + args.LastName;
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public void ItShouldExposeUncachedBodyGetterDiagnosticMetadata()
	{
		var analyzer = new AnalyzerUnderTest();

		var descriptor = Assert.Single(analyzer.SupportedDiagnostics);

		Assert.Equal("PUBLY0006", descriptor.Id);
		Assert.Equal("Cache request DTO getter results", descriptor.Title.ToString(CultureInfo.InvariantCulture));
		Assert.Equal("PublyApp.Correctness", descriptor.Category);
		Assert.Equal(DiagnosticSeverity.Hidden, descriptor.DefaultSeverity);
		Assert.False(descriptor.IsEnabledByDefault);
	}

	private static DiagnosticResult ExpectedDiagnostic(int location, string getter)
	{
		return Verifier
			.Diagnostic(DiagnosticIds.PUBLY0006)
			.WithLocation(location)
			.WithMessage(string.Format(CultureInfo.InvariantCulture, ExpectedMessage, getter));
	}

	private static async Task VerifyEnabledAsync(
		string source,
		params DiagnosticResult[] expected
	) {
		var test = new CSharpAnalyzerTest<AnalyzerUnderTest, DefaultVerifier>
		{
			TestCode = source,
		};

		test.TestState.AnalyzerConfigFiles.Add(("/.editorconfig", EnableConfig));
		test.ExpectedDiagnostics.AddRange(expected);

		await test.RunAsync();
	}
}
