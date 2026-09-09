using System.Collections.Immutable;
using System.Globalization;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CodeFixes;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Diagnostics;
using Microsoft.CodeAnalysis.Testing;

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
			ExpectedAt(1, "Default")
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

	private const string IsExternalInitPolyfill = """
		namespace System.Runtime.CompilerServices;

		public sealed class IsExternalInit {
		}
		""";
}
