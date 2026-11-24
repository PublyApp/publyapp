using System.Globalization;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Testing;

using Xunit;

using AnalyzerUnderTest = PublyApp.Analyzers.OnlyInjectedIntoAnalyzer;
using Verifier =
	Microsoft.CodeAnalysis.CSharp.Testing.CSharpAnalyzerVerifier<
		PublyApp.Analyzers.OnlyInjectedIntoAnalyzer,
		Microsoft.CodeAnalysis.Testing.DefaultVerifier>;

namespace PublyApp.Analyzers;

public sealed class OnlyInjectedIntoAnalyzerSpec {
	// PUBLY0013 ships enabled by default at error severity, so the test harness does not need an
	// .editorconfig entry. This stub file mirrors the shape the API uses: the port is marked with
	// the attribute, its registry is allowed, and the DI helpers exist under their real namespace.
	private const string _Stubs = """
		using System;
		using System.Collections.Generic;

		namespace PublyApp.Api.Lib.DI
		{
			[AttributeUsage(AttributeTargets.Interface)]
			public sealed class OnlyInjectedIntoAttribute : Attribute
			{
				public OnlyInjectedIntoAttribute(params Type[] allowed)
				{
					this.Allowed = allowed;
				}

				public IReadOnlyList<Type> Allowed { get; }
			}
		}

		namespace Microsoft.Extensions.DependencyInjection
		{
			public static class ServiceProviderServiceExtensions
			{
				public static T GetRequiredService<T>(this IServiceProvider provider) => default!;

				public static T? GetService<T>(this IServiceProvider provider) => default;

				public static IEnumerable<T> GetServices<T>(this IServiceProvider provider) => default!;
			}
		}

		namespace Microsoft.AspNetCore.Mvc
		{
			[AttributeUsage(AttributeTargets.Parameter)]
			public sealed class FromServicesAttribute : Attribute
			{
			}
		}

		namespace Sample
		{
			using PublyApp.Api.Lib.DI;

			public interface IOther
			{
			}

			[OnlyInjectedInto(typeof(Registry))]
			public interface IPort
			{
			}

			public sealed class Registry
			{
				public Registry(IPort port)
				{
				}
			}
		}
		""";

	private const string _ExpectedMessage = "'IPort' may only be injected into Registry";

	[Fact]
	public async Task ItShouldReportDiagnosticWhenAConstructorTakesThePort() {
		const string source = """
			namespace Sample;

			public sealed class Consumer
			{
				public Consumer({|#0:IPort|} port)
				{
				}
			}
			""";

		await OnlyInjectedIntoAnalyzerSpec._VerifyAsync(
			source,
			OnlyInjectedIntoAnalyzerSpec._ExpectedDiagnostic(0)
		);
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenAPrimaryConstructorTakesThePort() {
		const string source = """
			namespace Sample;

			public sealed class Consumer({|#0:IPort|} port)
			{
			}
			""";

		await OnlyInjectedIntoAnalyzerSpec._VerifyAsync(
			source,
			OnlyInjectedIntoAnalyzerSpec._ExpectedDiagnostic(0)
		);
	}

	[Fact]
	public async Task ItShouldReportDiagnosticWhenAFromServicesParameterTakesThePort() {
		const string source = """
			using Microsoft.AspNetCore.Mvc;

			namespace Sample;

			public sealed class Consumer
			{
				public void Handle([FromServices] {|#0:IPort|} port)
				{
				}
			}
			""";

		await OnlyInjectedIntoAnalyzerSpec._VerifyAsync(
			source,
			OnlyInjectedIntoAnalyzerSpec._ExpectedDiagnostic(0)
		);
	}

	[Theory]
	[InlineData("GetRequiredService")]
	[InlineData("GetService")]
	[InlineData("GetServices")]
	public async Task ItShouldReportDiagnosticWhenAServiceResolutionHelperTakesThePort(string helper) {
		var source = $$"""
			using System;
			using Microsoft.Extensions.DependencyInjection;

			namespace Sample;

			public sealed class Consumer
			{
				public void Handle(IServiceProvider provider)
				{
					_ = provider.{{helper}}<{|#0:IPort|}>();
				}
			}
			""";

		await OnlyInjectedIntoAnalyzerSpec._VerifyAsync(
			source,
			OnlyInjectedIntoAnalyzerSpec._ExpectedDiagnostic(0)
		);
	}

	[Theory]
	[InlineData("IPort[]")]
	[InlineData("IEnumerable<IPort>")]
	[InlineData("IReadOnlyList<IPort>")]
	[InlineData("ICollection<IPort>")]
	[InlineData("IList<IPort>")]
	public async Task ItShouldReportDiagnosticForEveryPublisherContainerShape(string container) {
		var source = $$"""
			using System.Collections.Generic;

			namespace Sample;

			public sealed class Consumer
			{
				public Consumer({|#0:{{container}}|} ports)
				{
				}
			}
			""";

		await OnlyInjectedIntoAnalyzerSpec._VerifyAsync(
			source,
			OnlyInjectedIntoAnalyzerSpec._ExpectedDiagnostic(0)
		);
	}

	[Fact]
	public async Task ItShouldNotReportDiagnosticForTheAllowedRegistry() {
		const string source = """
			namespace Sample;

			public sealed class Unrelated
			{
			}
			""";

		await OnlyInjectedIntoAnalyzerSpec._VerifyAsync(source);
	}

	[Fact]
	public async Task ItShouldNotReportDiagnosticInsideTheAddSocialAdapterRegistrationExtension() {
		const string source = """
			using System;
			using Microsoft.Extensions.DependencyInjection;

			namespace Sample;

			public static class Registration
			{
				public static void AddSocialAdapter(IServiceProvider provider)
				{
					_ = provider.GetRequiredService<IPort>();
				}
			}
			""";

		await OnlyInjectedIntoAnalyzerSpec._VerifyAsync(source);
	}

	[Fact]
	public async Task ItShouldNotReportDiagnosticInATestProject() {
		const string source = """
			namespace Sample;

			public sealed class Consumer
			{
				public Consumer(IPort port)
				{
				}
			}
			""";

		var test = new OnlyInjectedIntoAnalyzerSpec.TestProjectAnalyzerTest {
			TestCode = source,
		};
		test.TestState.Sources.Add(("Stubs.cs", OnlyInjectedIntoAnalyzerSpec._Stubs));

		await test.RunAsync();
	}

	[Fact]
	public async Task ItShouldNotReportDiagnosticForUnmarkedTypes() {
		const string source = """
			using System;
			using Microsoft.AspNetCore.Mvc;
			using Microsoft.Extensions.DependencyInjection;

			namespace Sample;

			public sealed class Consumer
			{
				public Consumer(IOther other)
				{
				}

				public void Handle([FromServices] IOther other, IServiceProvider provider)
				{
					_ = provider.GetRequiredService<IOther>();
					_ = provider.GetRequiredService<int>();
					_ = provider.GetServices<IOther>();
				}
			}
			""";

		await OnlyInjectedIntoAnalyzerSpec._VerifyAsync(source);
	}

	[Fact]
	public async Task ItShouldNotReportDiagnosticForAnOrdinaryMethodParameter() {
		const string source = """
			namespace Sample;

			public sealed class Consumer
			{
				public void Handle(IPort port)
				{
				}
			}
			""";

		await OnlyInjectedIntoAnalyzerSpec._VerifyAsync(source);
	}

	[Fact]
	public void ItShouldExposeOnlyInjectedIntoDiagnosticMetadata() {
		var analyzer = new AnalyzerUnderTest();

		var descriptor = Assert.Single(analyzer.SupportedDiagnostics);

		Assert.Equal(DiagnosticIds.PUBLY0013, descriptor.Id);
		Assert.Equal(
			"Restrict port injection to its registry",
			descriptor.Title.ToString(CultureInfo.InvariantCulture)
		);
		Assert.Equal("PublyApp.Architecture", descriptor.Category);
		Assert.Equal(DiagnosticSeverity.Error, descriptor.DefaultSeverity);
		Assert.True(descriptor.IsEnabledByDefault);
	}

	private static DiagnosticResult _ExpectedDiagnostic(int location) {
		return Verifier
			.Diagnostic(DiagnosticIds.PUBLY0013)
			.WithLocation(location)
			.WithMessage(OnlyInjectedIntoAnalyzerSpec._ExpectedMessage);
	}

	private static async Task _VerifyAsync(
		string source,
		params DiagnosticResult[] expected) {
		var test = new CSharpAnalyzerTest<AnalyzerUnderTest, DefaultVerifier> {
			TestCode = source,
		};

		test.TestState.Sources.Add(("Stubs.cs", OnlyInjectedIntoAnalyzerSpec._Stubs));
		test.ExpectedDiagnostics.AddRange(expected);

		await test.RunAsync();
	}

	// The analyzer reads Compilation.AssemblyName, so the only way to prove the test-project
	// exemption is a test host whose project name (and therefore assembly name) ends in .Tests.
	private sealed class TestProjectAnalyzerTest
		: CSharpAnalyzerTest<AnalyzerUnderTest, DefaultVerifier> {
		protected override string DefaultTestProjectName {
			get { return "PublyApp.Api.Tests"; }
		}
	}
}
