using System.Collections.Immutable;
using System.Globalization;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Diagnostics;
using Microsoft.CodeAnalysis.Testing;
using Xunit;
using AnalyzerUnderTest = PublyApp.Analyzers.InlineFluentValidationChainAnalyzer;
using Verifier =
	Microsoft.CodeAnalysis.CSharp.Testing.CSharpAnalyzerVerifier<
		PublyApp.Analyzers.InlineFluentValidationChainAnalyzer,
		Microsoft.CodeAnalysis.Testing.DefaultVerifier>;

namespace PublyApp.Analyzers;

public sealed class InlineFluentValidationChainAnalyzerSpec
{
	// PUBLY0005 ships disabled-by-default, so the test harness must explicitly enable it via
	// .editorconfig before the analyzer will surface any diagnostic.
	private const string EnableConfig = """
		root = true

		[*.cs]
		dotnet_diagnostic.PUBLY0005.severity = warning
		""";

	private const string ExpectedMessage =
		"Replace inline FluentValidation chains on JsonElement getters with JsonElementRules "
			+ "helpers";

	private const string ValidatorStub =
		"""
			namespace System.Text.Json {
				public struct JsonElement {
				}
			}

			public sealed class JsonModel
			{
				public System.Text.Json.JsonElement Email { get; set; }
				public System.Text.Json.JsonElement? ExpiresAt { get; set; }

				public System.Text.Json.JsonElement GetEmail()
				{
					return new System.Text.Json.JsonElement();
				}
			}

			namespace FluentValidation {
				public abstract class AbstractValidator<T>
				{
					public FluentRuleBuilder<T, TProp> RuleFor<TProp>(
						System.Func<T, TProp> selector
					)
					{
						return new FluentRuleBuilder<T, TProp>();
					}
				}

				public sealed class FluentRuleBuilder<T, TProp>
				{
					public FluentRuleBuilder<T, TProp> NotEmpty() => this;
					public FluentRuleBuilder<T, TProp> NotNull() => this;
					public FluentRuleBuilder<T, TProp> MaximumLength(int _) => this;
					public FluentRuleBuilder<T, TProp> EmailAddress() => this;
					public FluentRuleBuilder<T, TProp> Must() => this;
				}
			}

			namespace PublyApp.Api.Lib.Validation {
				public static class JsonElementRules
				{
					public static FluentValidation.FluentRuleBuilder<T, TProp>
						MustBeRequiredEmail<T, TProp>(
							this FluentValidation.FluentRuleBuilder<T, TProp> builder
					) {
						return builder;
					}

					public static FluentValidation.FluentRuleBuilder<T, TProp>
						MustBeRequiredString<T, TProp>(
							this FluentValidation.FluentRuleBuilder<T, TProp> builder
					) {
						return builder;
					}
				}
			}
		""";

	[Fact]
	public async Task ItShouldReportDiagnosticWhenInlineValidationChainIsUsedOnJsonElementGetter()
	{
		const string source = """
			using System;
			using FluentValidation;
			using PublyApp.Api.Lib.Validation;

			public sealed class ExampleValidator
				: AbstractValidator<JsonModel>
			{
				public ExampleValidator()
				{
					{|#0:RuleFor|}(x => x.GetEmail())
						.NotEmpty()
						.MaximumLength(200);
				}
			}

			""" + ValidatorStub;

		await VerifyEnabledAsync(source, ExpectedDiagnostic(0));
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenInlineChainUsesJsonElementPropertySelector()
	{
		const string source = """
			using System;
			using FluentValidation;
			using PublyApp.Api.Lib.Validation;

			public sealed class ExampleValidator
				: AbstractValidator<JsonModel>
			{
				public ExampleValidator()
				{
					{|#0:RuleFor|}(x => x.Email)
						.NotEmpty()
						.EmailAddress();
				}
			}

			""" + ValidatorStub;

		await VerifyEnabledAsync(source, ExpectedDiagnostic(0));
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenInlineChainUsesNullableJsonElementPropertySelector()
	{
		const string source = """
			using System;
			using FluentValidation;
			using PublyApp.Api.Lib.Validation;

			public sealed class ExampleValidator
				: AbstractValidator<JsonModel>
			{
				public ExampleValidator()
				{
					{|#0:RuleFor|}(x => x.ExpiresAt)
						.NotNull();
				}
			}

			""" + ValidatorStub;

		await VerifyEnabledAsync(source, ExpectedDiagnostic(0));
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenHelperChainAlsoUsesInlineOperator()
	{
		const string source = """
			using System;
			using FluentValidation;
			using PublyApp.Api.Lib.Validation;

			public sealed class ExampleValidator
				: AbstractValidator<JsonModel>
			{
				public ExampleValidator()
				{
					{|#0:RuleFor|}(x => x.Email)
						.MustBeRequiredString()
						.Must();
				}
			}

			""" + ValidatorStub;

		await VerifyEnabledAsync(source, ExpectedDiagnostic(0));
	}

	[Fact]
	public async Task ItShouldNotReportDiagnosticWhenJsonElementRulesHelperIsUsed()
	{
		const string source = """
			using System;
			using FluentValidation;
			using PublyApp.Api.Lib.Validation;

			public sealed class ExampleValidator
				: AbstractValidator<JsonModel>
			{
				public ExampleValidator()
				{
					RuleFor(x => x.GetEmail())
						.MustBeRequiredEmail();
				}
			}

			""" + ValidatorStub;

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldNotReportDiagnosticWhenAbstractValidatorIsFromDifferentNamespace()
	{
		const string source = """
			using System;
			using CustomValidation;

			namespace System.Text.Json {
				public struct JsonElement {
				}
			}

			public sealed class JsonModel
			{
				public System.Text.Json.JsonElement GetEmail()
				{
					return new System.Text.Json.JsonElement();
				}
			}

			public sealed class ExampleValidator
				: AbstractValidator<JsonModel>
			{
				public ExampleValidator()
				{
					RuleFor(x => x.GetEmail())
						.NotEmpty()
						.MaximumLength(200);
				}
			}

			namespace CustomValidation {
				public abstract class AbstractValidator<T>
				{
					public FluentRuleBuilder<T, TProp> RuleFor<TProp>(
						System.Func<T, TProp> selector
					)
					{
						return new FluentRuleBuilder<T, TProp>();
					}
				}

				public sealed class FluentRuleBuilder<T, TProp>
				{
					public FluentRuleBuilder<T, TProp> NotEmpty() => this;
					public FluentRuleBuilder<T, TProp> MaximumLength(int _) => this;
				}
			}
		""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldNotReportDiagnosticWhenChainIsOutsideAbstractValidator()
	{
		const string source = """
			using System;
			namespace System.Text.Json {
				public struct JsonElement {
				}
			}

			public sealed class NotAValidator
			{
				public System.Text.Json.JsonElement GetEmail()
				{
					return new System.Text.Json.JsonElement();
				}

				public NotAValidator()
				{
					RuleFor(x => x.GetEmail())
						.NotEmpty()
						.MaximumLength(200);
				}

				public FluentRuleBuilder<NotAValidator, TValue> RuleFor<TValue>(
					System.Func<NotAValidator, TValue> selector
				) {
					return new FluentRuleBuilder<NotAValidator, TValue>();
				}
			}

			public sealed class FluentRuleBuilder<T, TValue>
			{
				public FluentRuleBuilder<T, TValue> NotEmpty() => this;
				public FluentRuleBuilder<T, TValue> MaximumLength(int _) => this;
			}
		""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldReturnNoDiagnosticsWhenRuleIsDisabledByDefault()
	{
		const string source = """
			using System;
			using FluentValidation;

			namespace System.Text.Json {
				public struct JsonElement {
				}
			}

			public sealed class ExampleValidator
				: AbstractValidator<JsonModel>
			{
				public ExampleValidator()
				{
					RuleFor(x => x.GetEmail())
						.NotEmpty()
						.MaximumLength(200);
				}
			}

			public sealed class JsonModel
			{
				public System.Text.Json.JsonElement GetEmail()
				{
					return new System.Text.Json.JsonElement();
				}
			}

			namespace FluentValidation {
				public abstract class AbstractValidator<T>
				{
					public FluentRuleBuilder<T, TProp> RuleFor<TProp>(
						System.Func<T, TProp> selector
					)
					{
						return new FluentRuleBuilder<T, TProp>();
					}
				}

				public sealed class FluentRuleBuilder<T, TProp>
				{
					public FluentRuleBuilder<T, TProp> NotEmpty() => this;
					public FluentRuleBuilder<T, TProp> MaximumLength(int _) => this;
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

		Assert.DoesNotContain(diagnostics, diagnostic => diagnostic.Id == DiagnosticIds.PUBLY0005);
	}

	[Fact]
	public void ItShouldExposeInlineFluentValidationChainDiagnosticMetadata()
	{
		var analyzer = new AnalyzerUnderTest();

		var descriptor = Assert.Single(analyzer.SupportedDiagnostics);

		Assert.Equal("PUBLY0005", descriptor.Id);
		Assert.Equal(
			"Use shared JsonElementRules helpers",
			descriptor.Title.ToString(CultureInfo.InvariantCulture)
		);
		Assert.Equal("PublyApp.Validation", descriptor.Category);
		Assert.Equal(DiagnosticSeverity.Hidden, descriptor.DefaultSeverity);
		Assert.False(descriptor.IsEnabledByDefault);
	}

	private static DiagnosticResult ExpectedDiagnostic(int location)
	{
		return Verifier
			.Diagnostic(DiagnosticIds.PUBLY0005)
			.WithLocation(location)
			.WithMessage(ExpectedMessage);
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
