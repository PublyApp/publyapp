using System.Collections.Immutable;
using System.Globalization;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CodeActions;
using Microsoft.CodeAnalysis.CodeFixes;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Diagnostics;
using Microsoft.CodeAnalysis.Testing;
using Microsoft.CodeAnalysis.Text;

using Xunit;

using AnalyzerUnderTest = PublyApp.Analyzers.ExplicitMemberAccessAnalyzer;
using CodeFixTest =
	Microsoft.CodeAnalysis.CSharp.Testing.CSharpCodeFixTest<
		PublyApp.Analyzers.ExplicitMemberAccessAnalyzer,
		PublyApp.Analyzers.ExplicitMemberAccessCodeFixProvider,
		Microsoft.CodeAnalysis.Testing.DefaultVerifier>;
using Verifier =
	Microsoft.CodeAnalysis.CSharp.Testing.CSharpAnalyzerVerifier<
		PublyApp.Analyzers.ExplicitMemberAccessAnalyzer,
		Microsoft.CodeAnalysis.Testing.DefaultVerifier>;

namespace PublyApp.Analyzers;

public sealed class ExplicitMemberAccessAnalyzerSpec {
	private const string EnableConfig = """
		root = true

		[*.cs]
		dotnet_diagnostic.PUBLY0012.severity = warning
		""";

	[Fact]
	public async Task ItShouldReportUnqualifiedInstanceAndStaticMembers() {
		const string source = """
			namespace Sample;

			public sealed class Example {
				private int value;
				private static int Default => 1;

				public int Read() {
				return {|#0:value|} + {|#1:Default|};
				}
			}
			""";

		var test = new CSharpAnalyzerTest<AnalyzerUnderTest, DefaultVerifier> {
			TestCode = source,
		};
		test.TestState.AnalyzerConfigFiles.Add(("/.editorconfig", EnableConfig));
		test.ExpectedDiagnostics.AddRange(
		[
			Verifier.Diagnostic(DiagnosticIds.PUBLY0012)
				.WithLocation(0)
				.WithMessage("Qualify member access 'value' with 'this.' or its containing type"),
			Verifier.Diagnostic(DiagnosticIds.PUBLY0012)
				.WithLocation(1)
				.WithMessage("Qualify member access 'Default' with 'this.' or its containing type"),
		]
		);

		await test.RunAsync();
	}

	[Fact]
	public async Task ItShouldFixInstanceAndStaticMembers() {
		const string source = """
			namespace Sample;

			public sealed class Example {
				private int value;
				private static int Default => 1;

				public int Read() {
					return {|#0:value|} + {|#1:Default|};
				}
			}
			""";
		const string fixedSource = """
			namespace Sample;

			public sealed class Example {
				private int value;
				private static int Default => 1;

				public int Read() {
					return this.value + Example.Default;
				}
			}
			""";

		var test = new CodeFixTest {
			TestCode = source,
			FixedCode = fixedSource,
			BatchFixedCode = fixedSource,
		};
		test.TestState.AnalyzerConfigFiles.Add(("/.editorconfig", EnableConfig));
		test.ExpectedDiagnostics.AddRange(
		[
			Verifier.Diagnostic(DiagnosticIds.PUBLY0012)
				.WithLocation(0)
				.WithArguments("value"),
			Verifier.Diagnostic(DiagnosticIds.PUBLY0012)
				.WithLocation(1)
				.WithArguments("Default"),
		]
		);

		await test.RunAsync();
	}

	[Fact]
	public async Task ItShouldFixGenericNamesAndPreserveTrivia() {
		const string source = """
			namespace Sample;

			public sealed class Example<T> {
				public T Value;
				public static T Build<U>() => default!;

				public T Read() {
					return /* before */ {|#0:Value|} /* after */;
				}

				public T Create() {
					return /* before */ {|#1:Build|}<T>() /* after */;
				}
			}
			""";
		const string fixedSource = """
			namespace Sample;

			public sealed class Example<T> {
				public T Value;
				public static T Build<U>() => default!;

				public T Read() {
					return /* before */ this.Value /* after */;
				}

				public T Create() {
					return /* before */ Example<T>.Build<T>() /* after */;
				}
			}
			""";

		var test = new CodeFixTest {
			TestCode = source,
			FixedCode = fixedSource,
			BatchFixedCode = fixedSource,
		};
		test.TestState.AnalyzerConfigFiles.Add(("/.editorconfig", EnableConfig));
		test.ExpectedDiagnostics.AddRange(
		[
			Verifier.Diagnostic(DiagnosticIds.PUBLY0012)
				.WithLocation(0)
				.WithArguments("Value"),
			Verifier.Diagnostic(DiagnosticIds.PUBLY0012)
				.WithLocation(1)
				.WithArguments("Build"),
		]
		);

		await test.RunAsync();
	}

	[Fact]
	public async Task ItShouldFixNestedGenericContainingTypes() {
		const string source = """
			namespace Sample;

			public sealed class Outer<T> {
				public sealed class Inner<U> {
					public static int Default;

					public int Read() => {|#0:Default|};
				}
			}
			""";
		const string fixedSource = """
			namespace Sample;

			public sealed class Outer<T> {
				public sealed class Inner<U> {
					public static int Default;

					public int Read() => Outer<T>.Inner<U>.Default;
				}
			}
			""";

		var test = new CodeFixTest {
			TestCode = source,
			FixedCode = fixedSource,
			BatchFixedCode = fixedSource,
		};
		test.TestState.AnalyzerConfigFiles.Add(("/.editorconfig", EnableConfig));
		test.ExpectedDiagnostics.Add(ExpectedAt(0, "Default"));

		await test.RunAsync();
	}

	[Fact]
	public async Task ItShouldPreserveNameofResultsWhileQualifyingTheSyntax() {
		const string source = """
			namespace Sample;

			public sealed class Example {
				public int Value;
				public static int Default;

				public string Read() {
					return nameof({|#0:Value|}) + nameof({|#1:Default|});
				}
			}
			""";
		const string fixedSource = """
			namespace Sample;

			public sealed class Example {
				public int Value;
				public static int Default;

				public string Read() {
					return nameof(this.Value) + nameof(Example.Default);
				}
			}
			""";

		var test = new CodeFixTest {
			TestCode = source,
			FixedCode = fixedSource,
			BatchFixedCode = fixedSource,
		};
		test.TestState.AnalyzerConfigFiles.Add(("/.editorconfig", EnableConfig));
		test.ExpectedDiagnostics.AddRange(
		[
			ExpectedAt(0, "Value"),
			ExpectedAt(1, "Default"),
		]
		);

		await test.RunAsync();
	}

	[Fact]
	public async Task ItShouldUseGlobalTypeQualificationWhenAReceiverNameIsShadowed() {
		const string source = """
			namespace Sample;

			public sealed class Example {
				public static int Default;

				public int Read() {
					var Example = 0;
					return {|#0:Default|} + Example;
				}
			}
			""";
		const string fixedSource = """
			namespace Sample;

			public sealed class Example {
				public static int Default;

				public int Read() {
					var Example = 0;
					return global::Sample.Example.Default + Example;
				}
			}
			""";

		var test = new CodeFixTest {
			TestCode = source,
			FixedCode = fixedSource,
			BatchFixedCode = fixedSource,
		};
		test.TestState.AnalyzerConfigFiles.Add(("/.editorconfig", EnableConfig));
		test.ExpectedDiagnostics.Add(ExpectedAt(0, "Default"));

		await test.RunAsync();
	}

	[Fact]
	public void ItShouldExposeOneFixAndTheBatchFixAllProvider() {
		var provider = new ExplicitMemberAccessCodeFixProvider();

		Assert.Single(provider.FixableDiagnosticIds, DiagnosticIds.PUBLY0012);
		Assert.Same(WellKnownFixAllProviders.BatchFixer, provider.GetFixAllProvider());
	}

	[Fact]
	public async Task ItShouldReportEverySupportedMemberKind() {
		const string source = """
			using System;

			namespace Sample;

			public sealed class Example {
				public int Field;
				public int Property => 1;
				public event EventHandler? Changed;
				public static int StaticField;
				public static int StaticProperty => 1;
				public static event EventHandler? StaticChanged;

				public int Read() {
					{|#4:Changed|} += {|#6:OnChanged|};
					{|#5:StaticChanged|} += {|#7:OnChanged|};
					return {|#0:Field|} + {|#1:Property|} + {|#2:StaticField|}
						+ {|#3:StaticProperty|};
				}

				public void OnChanged(object? sender, EventArgs args) {
				}
			}
			""";

		await VerifyEnabledAsync(
			source,
			ExpectedAt(0, "Field"),
			ExpectedAt(1, "Property"),
			ExpectedAt(2, "StaticField"),
			ExpectedAt(3, "StaticProperty"),
			ExpectedAt(4, "Changed"),
			ExpectedAt(5, "StaticChanged"),
			ExpectedAt(6, "OnChanged"),
			ExpectedAt(7, "OnChanged")
		);
	}

	[Fact]
	public async Task ItShouldReportMethodsAndMethodGroups() {
		const string source = """
			using System;

			namespace Sample;

			public sealed class Example {
				public int Run() => 1;
				public static int Build<T>() => 1;

				public void Touch() {
					var action = {|#0:Run|};
					var value = {|#1:Run|}();
					Func<int> builder = {|#2:Build|}<int>;
					var built = {|#3:Build|}<int>();
					GC.KeepAlive(action);
					GC.KeepAlive(value);
					GC.KeepAlive(builder);
					GC.KeepAlive(built);
				}
			}
			""";

		await VerifyEnabledAsync(
			source,
			ExpectedAt(0, "Run"),
			ExpectedAt(1, "Run"),
			ExpectedAt(2, "Build"),
			ExpectedAt(3, "Build")
		);
	}

	[Fact]
	public async Task ItShouldReportValidOverloadedMethodGroups() {
		const string source = """
			namespace Sample;

			public sealed class Example {
				public void Run(int value) {
				}

				public void Run(string value) {
				}

				public static void Build<T>(T value) {
				}

				public static void Build<T>(string value) {
				}

				public string Read() {
					return nameof({|#0:Run|}) + nameof({|#1:Build|});
				}
			}
			""";

		await VerifyEnabledAsync(
			source,
			ExpectedAt(0, "Run"),
			ExpectedAt(1, "Build")
		);
	}

	[Fact]
	public async Task ItShouldFixValidOverloadedMethodGroups() {
		const string source = """
			namespace Sample;

			public sealed class Example {
				public void Run(int value) {
				}

				public void Run(string value) {
				}

				public static void Build<T>(T value) {
				}

				public static void Build<T>(string value) {
				}

				public string Read() {
					return nameof({|#0:Run|}) + nameof({|#1:Build|});
				}
			}
			""";
		const string fixedSource = """
			namespace Sample;

			public sealed class Example {
				public void Run(int value) {
				}

				public void Run(string value) {
				}

				public static void Build<T>(T value) {
				}

				public static void Build<T>(string value) {
				}

				public string Read() {
					return nameof(this.Run) + nameof(Example.Build);
				}
			}
			""";

		var test = new CodeFixTest {
			TestCode = source,
			FixedCode = fixedSource,
			BatchFixedCode = fixedSource,
		};
		test.TestState.AnalyzerConfigFiles.Add(("/.editorconfig", EnableConfig));
		test.ExpectedDiagnostics.AddRange(
		[
			ExpectedAt(0, "Run"),
			ExpectedAt(1, "Build"),
		]
		);

		await test.RunAsync();
	}

	[Fact]
	public async Task ItShouldReportContextResolvedOverloadedMemberUses() {
		const string source = """
			using System;

			namespace Sample;

			public sealed class Handler {
				public Handler(Action<int> action) {
				}

				public static void Consume(Action<int> action) {
				}
			}

			public sealed class Example {
				public void Run(int value) {
				}

				public void Run(string value) {
				}

				public static void Build<T>(T value) {
				}

				public static void Build<T>(string value) {
				}

				public void Use() {
					Action<int> first = {|#0:Run|};
					Action<string> second = {|#1:Run|};
					Action<int> generic = {|#2:Build|}<int>;
					Handler.Consume({|#3:Run|});
					_ = new Handler({|#4:Run|});
			        {|#5:Run|}(1);
				}
			}

			public sealed class MixedStaticness {
				private static void Mixed(int value) {
				}

				private void Mixed(string value) {
				}

				public string Read() => nameof(Mixed);
			}
			""";

		await VerifyEnabledAsync(
			source,
			ExpectedAt(0, "Run"),
			ExpectedAt(1, "Run"),
			ExpectedAt(2, "Build"),
			ExpectedAt(3, "Run"),
			ExpectedAt(4, "Run"),
			ExpectedAt(5, "Run")
		);
	}

	[Fact]
	public async Task ItShouldFixContextResolvedOverloadedMemberUses() {
		const string source = """
			using System;

			namespace Sample;

			public sealed class Handler {
				public Handler(Action<int> action) {
				}

				public static void Consume(Action<int> action) {
				}
			}

			public sealed class Example {
				public void Run(int value) {
				}

				public void Run(string value) {
				}

				public static void Build<T>(T value) {
				}

				public static void Build<T>(string value) {
				}

				public void Use() {
					Action<int> first = {|#0:Run|};
					Action<string> second = {|#1:Run|};
					Action<int> generic = {|#2:Build|}<int>;
					Handler.Consume({|#3:Run|});
					_ = new Handler({|#4:Run|});
			        {|#5:Run|}(1);
				}
			}
			""";
		const string fixedSource = """
			using System;

			namespace Sample;

			public sealed class Handler {
				public Handler(Action<int> action) {
				}

				public static void Consume(Action<int> action) {
				}
			}

			public sealed class Example {
				public void Run(int value) {
				}

				public void Run(string value) {
				}

				public static void Build<T>(T value) {
				}

				public static void Build<T>(string value) {
				}

				public void Use() {
					Action<int> first = this.Run;
					Action<string> second = this.Run;
					Action<int> generic = Example.Build<int>;
					Handler.Consume(this.Run);
					_ = new Handler(this.Run);
			        this.Run(1);
				}
			}
			""";

		var test = new CodeFixTest {
			TestCode = source,
			FixedCode = fixedSource,
			BatchFixedCode = fixedSource,
		};
		test.TestState.AnalyzerConfigFiles.Add(("/.editorconfig", EnableConfig));
		test.ExpectedDiagnostics.AddRange(
		[
			ExpectedAt(0, "Run"),
			ExpectedAt(1, "Run"),
			ExpectedAt(2, "Build"),
			ExpectedAt(3, "Run"),
			ExpectedAt(4, "Run"),
			ExpectedAt(5, "Run"),
		]
		);

		await test.RunAsync();
	}

	[Fact]
	public async Task ItShouldReportStaticMembersInNameofAndConditionalAccess() {
		const string source = """
			namespace Sample;

			public sealed class Example {
				public Example? Member;
				public static int Default;
				public int this[int index] => index;
				public void Touch() {
				}

				public string Read() {
					{|#2:Member|}?.Touch();
					var item = {|#3:Member|}?[0];
					return nameof({|#0:Member|}) + nameof({|#1:Default|})
						+ (item is null ? "" : item.ToString());
				}
			}
			""";

		await VerifyEnabledAsync(
			source,
			ExpectedAt(0, "Member"),
			ExpectedAt(1, "Default"),
			ExpectedAt(2, "Member"),
			ExpectedAt(3, "Member")
		);
	}

	[Fact]
	public async Task ItShouldLeaveExplicitReceiversAndNonMembersAlone() {
		const string source = """
			using System;

			namespace Sample;

			public interface IContract {
				void Run();
			}

			public class Base {
				public int BaseValue;
			}

			public sealed class Example : Base, IContract {
				public int Value;
				public static int Default;

				public void Read(int parameter) {
					var local = parameter;
					for (var index = 0; index < 1; index++) {
						_ = local + index + this.Value;
					}
					this.Value++;
					base.BaseValue++;
					Example.Default++;
					object.Equals(this.Value, Example.Default);
					IContract contract = this;
					contract.Run();
				}

				void IContract.Run() {
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldLeaveInitializerDesignatorsAndPatternNamesAlone() {
		const string source = """
			namespace Sample;

			public sealed class Example {
				public int Property { get; set; }
				public const int Default = 1;

				public Example(int property) {
					this.Property = property;
				}

				public Example Create() {
					return new Example({|#0:Default|}) { Property = {|#1:Default|} };
				}

				public int Match(Example example) {
					return example is { Property: {|#2:Default|} } ? 1 : 0;
				}
			}
			""";

		await VerifyEnabledAsync(
			source,
			ExpectedAt(0, "Default"),
			ExpectedAt(1, "Default"),
			ExpectedAt(2, "Default")
		);
	}

	[Fact]
	public async Task ItShouldAnalyzeWithInitializerValuesButNotDesignators() {
		const string source = """
			namespace Sample;

			public sealed record Example(int Value) {
				public const int Default = 1;

				public Example Copy() {
					return this with { Value = {|#0:Default|} };
				}
			}
			""";

		var test = new CSharpAnalyzerTest<AnalyzerUnderTest, DefaultVerifier> {
			TestCode = source,
		};
		test.TestState.Sources.Add(("IsExternalInit.cs", IsExternalInitPolyfill));
		test.TestState.AnalyzerConfigFiles.Add(("/.editorconfig", EnableConfig));
		test.ExpectedDiagnostics.Add(ExpectedAt(0, "Default"));

		await test.RunAsync();
	}

	[Fact]
	public async Task ItShouldAnalyzeInitializerAndPropertyPatternValueExpressions() {
		const string source = """
			namespace Sample;

			public sealed class Holder {
				public int Value { get; set; }
			}

			public sealed class Example {
				public int Current;
				public const int Default = 1;

				public Holder Create() {
					return new Holder { Value = ({|#0:Current|} = 1) };
				}

				public int Match(Holder candidate) {
					return candidate is { Value: {|#1:Default|} } ? 1 : 0;
				}
			}
			""";

		await VerifyEnabledAsync(
			source,
			ExpectedAt(0, "Current"),
			ExpectedAt(1, "Default")
		);
	}

	[Fact]
	public async Task ItShouldFixInitializerAndPropertyPatternValueExpressions() {
		const string source = """
			namespace Sample;

			public sealed class Holder {
				public int Value { get; set; }
			}

			public sealed class Example {
				public int Current;
				public const int Default = 1;

				public Holder Create() {
					return new Holder { Value = ({|#0:Current|} = 1) };
				}

				public int Match(Holder candidate) {
					return candidate is { Value: {|#1:Default|} } ? 1 : 0;
				}
			}
			""";
		const string fixedSource = """
			namespace Sample;

			public sealed class Holder {
				public int Value { get; set; }
			}

			public sealed class Example {
				public int Current;
				public const int Default = 1;

				public Holder Create() {
					return new Holder { Value = (this.Current = 1) };
				}

				public int Match(Holder candidate) {
					return candidate is { Value: Example.Default } ? 1 : 0;
				}
			}
			""";

		var test = new CodeFixTest {
			TestCode = source,
			FixedCode = fixedSource,
			BatchFixedCode = fixedSource,
		};
		test.TestState.AnalyzerConfigFiles.Add(("/.editorconfig", EnableConfig));
		test.ExpectedDiagnostics.AddRange(
		[
			ExpectedAt(0, "Current"),
			ExpectedAt(1, "Default"),
		]
		);

		await test.RunAsync();
	}

	[Fact]
	public async Task ItShouldAnalyzeCollectionElementArgumentsOnly() {
		const string source = """
			using System.Collections.Generic;

			namespace Sample;

			public sealed class Example {
				public const int Default = 1;

				public int Read() {
					var values = new List<int> { {|#0:Default|} };
					return values is null ? 0 : 1;
				}
			}
			""";

		await VerifyEnabledAsync(source, ExpectedAt(0, "Default"));
	}

	[Fact]
	public async Task ItShouldUseTheNearestTypeAndIncludeInheritedMembers() {
		const string source = """
			namespace Sample;

			public class Base {
				public int BaseValue;
				public static int BaseDefault;
			}

			public class Outer {
				public static int OuterDefault;

				public class Inner : Base {
					public int Value;
					public static int Default;

					public int Read() {
						return {|#0:Value|} + {|#1:BaseValue|}
							+ {|#2:Default|} + {|#3:BaseDefault|}
							+ OuterDefault;
					}
				}
			}
			""";

		await VerifyEnabledAsync(
			source,
			ExpectedAt(0, "Value"),
			ExpectedAt(1, "BaseValue"),
			ExpectedAt(2, "Default"),
			ExpectedAt(3, "BaseDefault")
		);
	}

	[Fact]
	public async Task ItShouldAnalyzeLambdasAndLocalFunctionBodies() {
		const string source = """
			using System;

			namespace Sample;

			public sealed class Example {
				public int Value;
				public static int Default;

				public void Read() {
					Func<int> lambda = () => {|#0:Value|};
					Func<int> staticLambda = static () => {|#1:Default|};
					int Local() => {|#2:Value|};
					static int StaticLocal() => {|#3:Default|};
					Func<int> localDelegate = Local;
					GC.KeepAlive(lambda);
					GC.KeepAlive(staticLambda);
					GC.KeepAlive(localDelegate);
				}
			}
			""";

		await VerifyEnabledAsync(
			source,
			ExpectedAt(0, "Value"),
			ExpectedAt(1, "Default"),
			ExpectedAt(2, "Value"),
			ExpectedAt(3, "Default")
		);
	}

	[Fact]
	public async Task ItShouldAnalyzeConstructorAttributesAndOptionalDefaults() {
		const string source = """
			using System;

			namespace Sample;

			public sealed class MarkerAttribute : Attribute {
				public MarkerAttribute(int value) {
				}
			}

			public class Base {
				public Base(int value) {
				}
			}

			[Marker({|#0:Default|})]
			public sealed class Example : Base {
				public const int Default = 1;
				public int Value;

				public Example(int value = {|#1:Default|}) : base({|#2:Default|}) {
					{|#4:Value|} = {|#3:Default|};
				}
			}
			""";

		await VerifyEnabledAsync(
			source,
			ExpectedAt(0, "Default"),
			ExpectedAt(1, "Default"),
			ExpectedAt(2, "Default"),
			ExpectedAt(3, "Default"),
			ExpectedAt(4, "Value")
		);
	}

	[Fact]
	public async Task ItShouldIgnoreReducedExtensionsAndUnresolvedNames() {
		const string source = """
			using System;

			namespace Sample;

			public static class Extensions {
				public static int Extension(this string value) => value.Length;
			}

			public sealed class Example {
				public int Value;

				public int Read(string text) {
					return text.Extension() + this.Value + {|#0:Missing|};
				}
			}
			""";

		await VerifyEnabledAsync(
			source,
			DiagnosticResult.CompilerError("CS0103")
				.WithLocation(0)
				.WithArguments("Missing")
		);
	}

	[Fact]
	public async Task ItShouldIgnoreAmbiguousCandidates() {
		const string source = """
			namespace Sample;

			public sealed class Example {
				private static int M(System.IComparable value) => 1;
				private static int M(System.IFormattable value) => 2;

				public int Read() {
					return {|#0:M|}(null);
				}
			}
			""";

		await VerifyEnabledAsync(
			source,
			DiagnosticResult.CompilerError("CS0121").WithLocation(0)
		);
	}

	[Fact]
	public async Task ItShouldKeepLanguageConstructsAndIdentifiersOutsideTheBoundary() {
		const string source = """
			using Alias = Sample.Example;

			namespace Sample;

			public interface IContract {
				void Run();
			}

			public sealed class Example : IContract {
				public int Value;
				public static int Default;

				public Example() {
					this.Value = Example.Default;
				}

				~Example() {
					this.Value = Example.Default;
				}

				public static Example operator +(Example left, Example right) {
					return new Example { Value = left.Value + right.Value };
				}

				public static explicit operator int(Example value) {
					return value.Value;
				}

				public int this[int index] {
					get { return this.Value + index; }
					set { this.Value = value; }
				}

				public int Read(int[] values) {
					foreach (var item in values) {
						_ = item;
					}
					if (values is [var first, ..]) {
						_ = first;
					}
					Alias.Default.ToString();
					goto Finished;
				Finished:
					return 1;
				}

				void IContract.Run() {
					this.Value = Example.Default;
				}
			}
			""";

		await VerifyEnabledAsync(source);
	}

	[Fact]
	public async Task ItShouldStaySilentForGeneratedFiles() {
		const string source = """
			using System.CodeDom.Compiler;

			namespace Sample;

			[GeneratedCode("tool", "1")]
			public sealed class GeneratedExample {
				public int Value;

				public int Read() => Value;
			}
			""";

		await VerifyEnabledAsync(source);
		await VerifyEnabledWithFileNameAsync("Generated.g.cs", source);
		await VerifyEnabledWithFileNameAsync("Designer.designer.cs", source);
		await VerifyEnabledWithFileNameAsync("Generated.generated.cs", source);
		await VerifyEnabledWithFileNameAsync(
			"AutoGenerated.cs",
			"// <auto-generated />\n" + source
		);
		await VerifyEnabledWithFileNameAsync(
			"apps/api/Migrations/Example.cs",
			source
		);
	}

	[Fact]
	public async Task ItShouldAnalyzeMigrationSpecs() {
		const string source = """
			namespace Sample;

			public sealed class Example {
				public static int Default;

				public int Read() => {|#0:Default|};
			}
			""";

		await VerifyEnabledWithFileNameAsync(
			"apps/api/Migrations/Example.Spec.cs",
			source,
			ExpectedAt(0, "Default")
		);
	}

	[Fact]
	public async Task ItShouldRevalidateGeneratedAndMigrationBoundariesInTheProvider() {
		const string source = """
			namespace Sample;

			public sealed class Example {
				public static int Default;

				public int Read() => Default;
			}
			""";
		const string generatedAttributeSource = """
			using System.CodeDom.Compiler;

			namespace Sample;

			[GeneratedCode("tool", "1")]
			public sealed class Example {
				public static int Default;

				public int Read() => Default;
			}
			""";

		var noActionCases = new[] {
			("apps/api/Migrations/Generated.cs", source),
			("Generated.g.cs", source),
			("Designer.designer.cs", source),
			("Generated.generated.cs", source),
			("AutoGenerated.cs", "// <auto-generated />\n" + source),
			("GeneratedAttribute.cs", generatedAttributeSource),
		};

		foreach (var (fileName, caseSource) in noActionCases) {
			var actions = await GetCodeActionsAsync(fileName, caseSource);
			Assert.Empty(actions);
		}

		var migrationSpecActions = await GetCodeActionsAsync(
			"apps/api/Migrations/Generated.Spec.cs",
			source
		);
		Assert.Single(migrationSpecActions);

		const string ambiguousSource = """
			namespace Sample;

			public sealed class Example {
				private static int Run(System.IComparable value) => 1;
				private static int Run(System.IFormattable value) => 2;

				public int Read() => Run(null);
			}
			""";
		var ambiguousActions = await GetCodeActionsAsync(
			"Ambiguous.cs",
			ambiguousSource,
			"Run"
		);
		Assert.Empty(ambiguousActions);

		const string mixedStaticnessSource = """
			namespace Sample;

			public sealed class Example {
				private static void Mixed(int value) {
				}

				private void Mixed(string value) {
				}

				public string Read() => nameof(Mixed);
			}
			""";
		var mixedStaticnessActions = await GetCodeActionsAsync(
			"MixedStaticness.cs",
			mixedStaticnessSource,
			"Mixed"
		);
		Assert.Empty(mixedStaticnessActions);
	}

	[Fact]
	public async Task ItShouldFixAllAcrossDocumentsAndProjectsWithoutTouchingUnsafeCode() {
		const string firstSource = """
			namespace Sample;

			public sealed class First {
				public int Value;

				public int Read() => /* first-before */ {|#0:Value|} /* first-after */;
			}
			""";
		const string firstFixedSource = """
			namespace Sample;

			public sealed class First {
				public int Value;

				public int Read() => /* first-before */ this.Value /* first-after */;
			}
			""";
		const string secondSource = """
			namespace Sample;

			public sealed class Second {
				public static int Default;

				public int Read() => /* second-before */ {|#1:Default|} /* second-after */;
			}
			""";
		const string secondFixedSource = """
			namespace Sample;

			public sealed class Second {
				public static int Default;

				public int Read() => /* second-before */ Second.Default /* second-after */;
			}
			""";
		const string unsafeSource = """
			namespace Sample;

			public sealed class Unsafe {
				private static int Run(System.IComparable value) => 1;
				private static int Run(System.IFormattable value) => 2;

				public int Read() => {|#2:Run|}(null);
			}
			""";

		var test = new CodeFixTest {
			TestCode = firstSource,
			FixedCode = firstFixedSource,
			BatchFixedCode = firstFixedSource,
		};
		test.TestState.Sources.Add(("Second.cs", secondSource));
		test.TestState.Sources.Add(("Unsafe.cs", unsafeSource));
		test.FixedState.Sources.Add(("Second.cs", secondFixedSource));
		test.FixedState.Sources.Add(("Unsafe.cs", unsafeSource));
		test.BatchFixedState.Sources.Add(("Second.cs", secondFixedSource));
		test.BatchFixedState.Sources.Add(("Unsafe.cs", unsafeSource));

		const string otherSource = """
			namespace Other;

			public sealed class Other {
				public int Value;

				public int Read() => {|#3:Value|};
			}
			""";
		const string otherFixedSource = """
			namespace Other;

			public sealed class Other {
				public int Value;

				public int Read() => this.Value;
			}
			""";
		test.TestState.AdditionalProjects["OtherProject"].Sources.Add(
			("/OtherProject/Test/Other.cs", otherSource)
		);
		test.TestState.AdditionalProjects["OtherProject"].AnalyzerConfigFiles.Add(
			("/OtherProject/.editorconfig", EnableConfig)
		);
		test.TestState.AdditionalProjectReferences.Add("OtherProject");
		test.FixedState.AdditionalProjects["OtherProject"].Sources.Add(
			("/OtherProject/Test/Other.cs", otherFixedSource)
		);
		test.FixedState.AdditionalProjects["OtherProject"].AnalyzerConfigFiles.Add(
			("/OtherProject/.editorconfig", EnableConfig)
		);
		test.BatchFixedState.AdditionalProjects["OtherProject"].Sources.Add(
			("/OtherProject/Test/Other.cs", otherFixedSource)
		);
		test.BatchFixedState.AdditionalProjects["OtherProject"].AnalyzerConfigFiles.Add(
			("/OtherProject/.editorconfig", EnableConfig)
		);

		test.TestState.AnalyzerConfigFiles.Add(("/.editorconfig", EnableConfig));
		test.ExpectedDiagnostics.AddRange(
		[
			ExpectedAt(0, "Value"),
			Verifier.Diagnostic(DiagnosticIds.PUBLY0012)
				.WithSpan("/OtherProject/Test/Other.cs", 6, 23, 6, 28)
				.WithSeverity(DiagnosticSeverity.Warning)
				.WithArguments("Value"),
			ExpectedAt(1, "Default"),
			DiagnosticResult.CompilerError("CS0121").WithLocation(2),
		]
		);

		await test.RunAsync();
	}

	[Fact]
	public async Task ItShouldRemainDisabledWithoutEditorConfig() {
		const string source = """
			namespace Sample;

			public sealed class Example {
				public int Value;
				public int Read() => Value;
			}
			""";

		var compilation = CSharpCompilation.Create(
			"DefaultOffAssembly",
			[CSharpSyntaxTree.ParseText(source)],
			[
				MetadataReference.CreateFromFile(typeof(object).Assembly.Location),
				MetadataReference.CreateFromFile(typeof(Enumerable).Assembly.Location),
			],
			new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary)
		);

		var analyzers = ImmutableArray.Create<DiagnosticAnalyzer>(
			new AnalyzerUnderTest()
		);
		var diagnostics = await compilation
			.WithAnalyzers(analyzers)
			.GetAnalyzerDiagnosticsAsync();

		Assert.DoesNotContain(
			diagnostics,
			diagnostic => diagnostic.Id == DiagnosticIds.PUBLY0012
		);
	}

	[Fact]
	public void ItShouldExposeExplicitMemberAccessDiagnosticMetadata() {
		var analyzer = new AnalyzerUnderTest();
		var descriptor = Assert.Single(analyzer.SupportedDiagnostics);

		Assert.Equal(DiagnosticIds.PUBLY0012, descriptor.Id);
		Assert.Equal(
			"Use explicit member access",
			descriptor.Title.ToString(CultureInfo.InvariantCulture)
		);
		Assert.Equal("PublyApp.Style", descriptor.Category);
		Assert.Equal(DiagnosticSeverity.Hidden, descriptor.DefaultSeverity);
		Assert.False(descriptor.IsEnabledByDefault);
	}

	private static DiagnosticResult ExpectedAt(int marker, string memberName) {
		return Verifier
			.Diagnostic(DiagnosticIds.PUBLY0012)
			.WithLocation(marker)
			.WithArguments(memberName);
	}

	private static async Task VerifyEnabledAsync(
		string source,
		params DiagnosticResult[] expected
	) {
		var test = new CSharpAnalyzerTest<AnalyzerUnderTest, DefaultVerifier> {
			TestCode = source,
		};
		test.TestState.AnalyzerConfigFiles.Add(("/.editorconfig", EnableConfig));
		test.ExpectedDiagnostics.AddRange(expected);

		await test.RunAsync();
	}

	private static async Task VerifyEnabledWithFileNameAsync(
		string fileName,
		string source,
		params DiagnosticResult[] expected
	) {
		var test = new CSharpAnalyzerTest<AnalyzerUnderTest, DefaultVerifier>();
		test.TestState.Sources.Add((fileName, source));
		test.TestState.AnalyzerConfigFiles.Add(("/.editorconfig", EnableConfig));
		test.ExpectedDiagnostics.AddRange(expected);

		await test.RunAsync();
	}

	private static async Task<IReadOnlyList<CodeAction>> GetCodeActionsAsync(
		string fileName,
		string source,
		string memberName = "Default"
	) {
		using var workspace = new AdhocWorkspace();
		var projectId = ProjectId.CreateNewId();
		var project = ProjectInfo.Create(
			projectId,
			VersionStamp.Create(),
			"ProviderTest",
			"ProviderTest",
			LanguageNames.CSharp
		).WithMetadataReferences(
			[
				MetadataReference.CreateFromFile(typeof(object).Assembly.Location),
				MetadataReference.CreateFromFile(typeof(Enumerable).Assembly.Location),
				MetadataReference.CreateFromFile(
					typeof(System.CodeDom.Compiler.GeneratedCodeAttribute).Assembly.Location
				),
			]
		);
		var documentId = DocumentId.CreateNewId(projectId);
		var solution = workspace.CurrentSolution
			.AddProject(project)
			.AddDocument(
				DocumentInfo.Create(
					documentId,
					fileName,
					filePath: fileName,
					loader: TextLoader.From(
						TextAndVersion.Create(SourceText.From(source), VersionStamp.Create())
					)
				)
			);
		var document = solution.GetDocument(documentId);
		if (document is null) {
			throw new InvalidOperationException("The provider test document was not created.");
		}

		var root = await document.GetSyntaxRootAsync();
		if (root is null) {
			throw new InvalidOperationException("The provider test root was not created.");
		}

		var name = root.DescendantNodes()
			.OfType<IdentifierNameSyntax>()
			.Single(candidate => candidate.Identifier.ValueText == memberName);
		var diagnostic = Diagnostic.Create(
			DiagnosticCatalog.ExplicitMemberAccess,
			name.Identifier.GetLocation(),
			name.Identifier.ValueText
		);
		var actions = new List<CodeAction>();
		var context = new CodeFixContext(
			document,
			diagnostic,
			(action, _) => actions.Add(action),
			CancellationToken.None
		);

		await new ExplicitMemberAccessCodeFixProvider().RegisterCodeFixesAsync(context);
		return actions;
	}

	private const string IsExternalInitPolyfill = """
		namespace System.Runtime.CompilerServices;

		public sealed class IsExternalInit {
		}
		""";

}
