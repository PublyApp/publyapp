using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Testing;

using System.Globalization;
using System.Text;

using Xunit;

using AnalyzerUnderTest =
	PublyApp.Analyzers.EndpointRateLimitAnalyzer;
using Verifier =
	Microsoft.CodeAnalysis.CSharp.Testing
		.CSharpAnalyzerVerifier<
			PublyApp.Analyzers.EndpointRateLimitAnalyzer,
			Microsoft.CodeAnalysis.Testing.DefaultVerifier>;

namespace PublyApp.Analyzers;

public sealed class EndpointRateLimitAnalyzerSpec {
	private const string EnableConfig = """
		root = true

		[*.cs]
		dotnet_diagnostic.PUBLY0011.severity = warning
		""";

	private const string EndpointStubs = """
		global using PublyApp.Api.Lib.RateLimiting;

		using System;

		namespace Microsoft.AspNetCore.Routing
		{
			public interface IEndpointRouteBuilder
			{
			}

			public sealed class RouteGroupBuilder
				: IEndpointRouteBuilder,
					Microsoft.AspNetCore.Builder.IEndpointConventionBuilder
			{
			}
		}

		namespace Microsoft.AspNetCore.Builder
		{
			public sealed class RouteBuilder
				: Microsoft.AspNetCore.Routing.IEndpointRouteBuilder
			{
			}

			public interface IEndpointConventionBuilder
			{
			}

			public sealed class RouteHandlerBuilder
				: IEndpointConventionBuilder
			{
			}

			public static class EndpointRouteBuilderExtensions
			{
				public static Microsoft.AspNetCore.Routing.RouteGroupBuilder MapGroup(
					this Microsoft.AspNetCore.Routing.IEndpointRouteBuilder builder,
					string pattern
				) => new Microsoft.AspNetCore.Routing.RouteGroupBuilder();

				public static RouteHandlerBuilder MapGet(
					this Microsoft.AspNetCore.Routing.IEndpointRouteBuilder builder,
					string pattern,
					Action handler
				) => new RouteHandlerBuilder();
			}

			public static class EndpointExtensions
			{
				public static RouteHandlerBuilder MapWidget(
					this Microsoft.AspNetCore.Routing.IEndpointRouteBuilder builder,
					string pattern,
					Action handler
				) => EndpointRouteBuilderExtensions.MapGet(
					builder,
					pattern,
					handler
				);

				public static IEndpointConventionBuilder MapArea(
					this Microsoft.AspNetCore.Routing.IEndpointRouteBuilder builder
				) => builder.MapGroup("/area");

				public static RouteHandlerBuilder AddEndpointFilter(
					this RouteHandlerBuilder builder
				) => builder;
			}

			public static class RateLimiterEndpointConventionBuilderExtensions
			{
				public static TBuilder RequireRateLimiting<TBuilder>(
					this TBuilder builder,
					string policy
				) where TBuilder : IEndpointConventionBuilder => builder;

				public static TBuilder DisableRateLimiting<TBuilder>(
					this TBuilder builder
				) where TBuilder : IEndpointConventionBuilder => builder;
			}
		}

		namespace PublyApp.Api.Lib.RateLimiting
		{
			public static class ApiRateLimitEndpointExtensions
			{
				public static TBuilder WithGlobalRateLimitOnly<TBuilder>(
					this TBuilder builder
				) where TBuilder
					: Microsoft.AspNetCore.Builder.IEndpointConventionBuilder
					=> builder;

				public static TBuilder WithRateLimitOptOut<TBuilder>(
					this TBuilder builder,
					string reason
				) where TBuilder
					: Microsoft.AspNetCore.Builder.IEndpointConventionBuilder
					=> builder;
			}

			public static class AnonymousAuthRateLimitExtensions
			{
				public static TBuilder RequireAnonymousAuthIpRateLimit<TBuilder>(
					this TBuilder builder
				) where TBuilder
					: Microsoft.AspNetCore.Builder.IEndpointConventionBuilder
					=> builder;
			}
		}
		""";

	private const string UnrelatedStubs = """
		namespace Unrelated
		{
			public sealed class UnrelatedBuilder
			{
			}

			public static class UnrelatedExtensions
			{
				public static UnrelatedBuilder GetUnrelated(
					this Microsoft.AspNetCore.Builder.IEndpointConventionBuilder builder
				) => new UnrelatedBuilder();

				public static UnrelatedBuilder DisableRateLimiting(
					this UnrelatedBuilder builder
				) => builder;

				public static UnrelatedBuilder WithRateLimitOptOut(
					this UnrelatedBuilder builder,
					string reason
				) => builder;

				public static Microsoft.AspNetCore.Builder.RouteHandlerBuilder
					WithRateLimitOptOut(
					this Microsoft.AspNetCore.Builder.RouteHandlerBuilder builder,
					string reason
				) => builder;
			}
		}
		""";

	[Fact]
	public async Task ItShouldReportAnUnprotectedEndpointMapping() {
		const string source = """
			using Microsoft.AspNetCore.Builder;

			var app = new RouteBuilder();
			app.{|#0:MapGet|}("/unprotected", () => { });
			""";

		await VerifyAsync(
			source,
			Verifier
				.Diagnostic(DiagnosticIds.PUBLY0011)
				.WithLocation(0)
				.WithArguments("MapGet")
		);
	}

	[Fact]
	public async Task ItShouldAcceptADirectNamedPolicy() {
		const string source = """
			using Microsoft.AspNetCore.Builder;

			var app = new RouteBuilder();
			app.MapGet("/protected", () => { })
				.RequireRateLimiting("authenticated-default");
			""";

		await VerifyAsync(source);
	}

	[Fact]
	public async Task ItShouldRejectAnUnknownNamedPolicy() {
		const string source = """
			using Microsoft.AspNetCore.Builder;

			var app = new RouteBuilder();
			app.{|#0:MapGet|}("/typo", () => { })
				.RequireRateLimiting("authenitcated-default");
			""";

		await VerifyAsync(
			source,
			Verifier
				.Diagnostic(DiagnosticIds.PUBLY0011)
				.WithLocation(0)
				.WithArguments("MapGet")
		);
	}

	[Fact]
	public async Task ItShouldAcceptAnInheritedRouteGroupPolicy() {
		const string source = """
			using Microsoft.AspNetCore.Builder;

			var app = new RouteBuilder();
			var group = app.MapGroup("/staff")
				.RequireRateLimiting("authenticated-default");
			group.MapGet("/users", () => { });
			""";

		await VerifyAsync(source);
	}

	[Fact]
	public async Task ItShouldAcceptANestedInheritedRouteGroupPolicy() {
		const string source = """
			using Microsoft.AspNetCore.Builder;

			var app = new RouteBuilder();
			var group = app.MapGroup("/staff")
				.RequireRateLimiting("authenticated-default");
			var nested = group.MapGroup("/permissions");
			nested.MapGet("/scopes", () => { });
			""";

		await VerifyAsync(source);
	}

	[Fact]
	public async Task ItShouldAcceptTheGlobalOnlyMarker() {
		const string source = """
			using Microsoft.AspNetCore.Builder;

			var app = new RouteBuilder();
			app.MapGet("/global-only", () => { })
				.WithGlobalRateLimitOnly();
			""";

		await VerifyAsync(source);
	}

	[Fact]
	public async Task ItShouldAcceptAnOptOutMarkerWithAReason() {
		const string source = """
			using Microsoft.AspNetCore.Builder;

			var app = new RouteBuilder();
			app.MapGet("/health", () => { })
				.WithRateLimitOptOut("load-balancer health probe");
			""";

		await VerifyAsync(source);
	}

	[Fact]
	public async Task ItShouldAcceptAnApprovedNamedPolicyHelper() {
		const string source = """
			using Microsoft.AspNetCore.Builder;

			var app = new RouteBuilder();
			app.MapGet("/auth/check", () => { })
				.RequireAnonymousAuthIpRateLimit();
			""";

		await VerifyAsync(source);
	}

	[Fact]
	public async Task ItShouldRejectDisableRateLimitingWithoutTheReasonMarker() {
		const string source = """
			using Microsoft.AspNetCore.Builder;

			var app = new RouteBuilder();
			app.{|#0:MapGet|}("/health", () => { })
				.DisableRateLimiting();
			""";

		await VerifyAsync(
			source,
			Verifier
				.Diagnostic(DiagnosticIds.PUBLY0011)
				.WithLocation(0)
				.WithArguments("MapGet")
		);
	}

	[Fact]
	public async Task
	ItShouldRejectEndpointDisableOverridingAnInheritedNamedPolicy() {
		const string source = """
			using Microsoft.AspNetCore.Builder;

			var app = new RouteBuilder();
			var group = app.MapGroup("/staff")
				.RequireRateLimiting("authenticated-default");
			group.{|#0:MapGet|}("/users", () => { })
				.DisableRateLimiting();
			""";

		await VerifyAsync(
			source,
			Verifier
				.Diagnostic(DiagnosticIds.PUBLY0011)
				.WithLocation(0)
				.WithArguments("MapGet")
		);
	}

	[Fact]
	public async Task
	ItShouldRejectSplitEndpointDisableOverridingAnInheritedNamedPolicy() {
		const string source = """
			using Microsoft.AspNetCore.Builder;

			var app = new RouteBuilder();
			var group = app.MapGroup("/staff")
				.RequireRateLimiting("authenticated-default");
			var endpoint = group.{|#0:MapGet|}("/users", () => { });
			endpoint.DisableRateLimiting();
			""";

		await VerifyAsync(
			source,
			Verifier
				.Diagnostic(DiagnosticIds.PUBLY0011)
				.WithLocation(0)
				.WithArguments("MapGet")
		);
	}

	[Fact]
	public async Task
	ItShouldRejectChainedCapturedDisableOverridingAnInheritedNamedPolicy() {
		const string source = """
			using Microsoft.AspNetCore.Builder;

			var app = new RouteBuilder();
			var group = app.MapGroup("/staff")
				.RequireRateLimiting("authenticated-default");
			var endpoint = group.{|#0:MapGet|}("/users", () => { });
			endpoint.AddEndpointFilter().DisableRateLimiting();
			""";

		await VerifyAsync(
			source,
			Verifier
				.Diagnostic(DiagnosticIds.PUBLY0011)
				.WithLocation(0)
				.WithArguments("MapGet")
		);
	}

	[Fact]
	public async Task
	ItShouldRejectAnUncoveredEndpointDespiteUnrelatedCapturedDispositions() {
		const string source = """
			using Microsoft.AspNetCore.Builder;
			using Unrelated;

			var app = new RouteBuilder();
			var endpoint = app.{|#0:MapGet|}(
				"/uncovered",
				() => { }
			);
			endpoint.GetUnrelated()
				.DisableRateLimiting()
				.WithRateLimitOptOut("unrelated metadata");
			""";

		await VerifyAsync(
			source,
			Verifier
				.Diagnostic(DiagnosticIds.PUBLY0011)
				.WithLocation(0)
				.WithArguments("MapGet")
		);
	}

	[Fact]
	public async Task
	ItShouldIgnoreUnrelatedCapturedDisableRateLimitingCalls() {
		const string source = """
			using Microsoft.AspNetCore.Builder;
			using Unrelated;

			var app = new RouteBuilder();
			var endpoint = app.MapGet(
					"/global-only",
					() => { }
				)
				.WithGlobalRateLimitOnly();
			endpoint.GetUnrelated().DisableRateLimiting();
			""";

		await VerifyAsync(source);
	}

	[Fact]
	public async Task
	ItShouldRejectUnrelatedEndpointBuilderOptOutDisposition() {
		const string source = """
			using Microsoft.AspNetCore.Builder;
			using Unrelated;

			var app = new RouteBuilder();
			var endpoint = app.{|#0:MapGet|}(
				"/uncovered",
				() => { }
			);
			endpoint.WithRateLimitOptOut("unrelated metadata");
			""";

		await VerifyAsync(
			source,
			Verifier
				.Diagnostic(DiagnosticIds.PUBLY0011)
				.WithLocation(0)
				.WithArguments("MapGet")
		);
	}

	[Fact]
	public async Task
	ItShouldAcceptCapturedEndpointOptOutWithAReason() {
		const string source = """
			using Microsoft.AspNetCore.Builder;

			var app = new RouteBuilder();
			var endpoint = app.MapGet("/health", () => { });
			endpoint.WithRateLimitOptOut("load-balancer health probe");
			""";

		await VerifyAsync(source);
	}

	[Fact]
	public async Task
	ItShouldAcceptChainedCapturedEndpointOptOutWithAReason() {
		const string source = """
			using Microsoft.AspNetCore.Builder;

			var app = new RouteBuilder();
			var endpoint = app.MapGet("/health", () => { });
			endpoint.AddEndpointFilter()
				.WithRateLimitOptOut("load-balancer health probe");
			""";

		await VerifyAsync(source);
	}

	[Fact]
	public async Task ItShouldAnalyzeCustomEndpointMappingHelpers() {
		const string source = """
			using Microsoft.AspNetCore.Builder;

			var app = new RouteBuilder();
			app.{|#0:MapWidget|}("/widget", () => { });
			""";

		await VerifyAsync(
			source,
			Verifier
				.Diagnostic(DiagnosticIds.PUBLY0011)
				.WithLocation(0)
				.WithArguments("MapWidget")
		);
	}

	[Fact]
	public async Task
	ItShouldAnalyzeInterfaceReturningTerminalMappingHelpers() {
		const string source = """
			using Microsoft.AspNetCore.Builder;

			var app = new RouteBuilder();
			app.{|#0:MapInterfaceWidget|}(
				"/widget",
				() => { }
			);

			static class WidgetEndpointExtensions
			{
				public static IEndpointConventionBuilder MapInterfaceWidget(
					this Microsoft.AspNetCore.Routing.IEndpointRouteBuilder builder,
					string pattern,
					System.Action handler
				) => builder.{|#1:MapGet|}(pattern, handler);
			}
			""";

		await VerifyAsync(
			source,
			Verifier
				.Diagnostic(DiagnosticIds.PUBLY0011)
				.WithLocation(0)
				.WithArguments("MapInterfaceWidget"),
			Verifier
				.Diagnostic(DiagnosticIds.PUBLY0011)
				.WithLocation(1)
				.WithArguments("MapGet")
		);
	}

	[Fact]
	public async Task
	ItShouldAnalyzeSiblingReturnsCallingTheSameTerminalHelper() {
		const string source = """
			using Microsoft.AspNetCore.Builder;

			var app = new RouteBuilder();
			app.{|#0:MapConditional|}(true);

			static class ConditionalEndpointExtensions
			{
				public static RouteHandlerBuilder MapConditional(
					this Microsoft.AspNetCore.Routing.IEndpointRouteBuilder builder,
					bool first
				)
				{
					if (first)
					{
						return builder.MapInner()
							.WithGlobalRateLimitOnly();
					}

					return builder.MapInner()
						.WithGlobalRateLimitOnly();
				}

				private static RouteHandlerBuilder MapInner(
					this Microsoft.AspNetCore.Routing.IEndpointRouteBuilder builder
				) => builder.MapGet("/inner", () => { })
					.WithGlobalRateLimitOnly();
			}
			""";

		await VerifyAsync(
			source,
			Verifier
				.Diagnostic(DiagnosticIds.PUBLY0011)
				.WithLocation(0)
				.WithArguments("MapConditional")
		);
	}

	[Fact]
	public async Task
	ItShouldAnalyzeABranchyDagWithSharedTerminalHelpers() {
		const int branchDepth = 14;
		var helpers = new StringBuilder();
		for (var level = 0; level < branchDepth; level++) {
			var nextLevel = level + 1;
			helpers.Append(
				CultureInfo.InvariantCulture,
				$$"""
					public static RouteHandlerBuilder MapLevel{{level}}(
						this Microsoft.AspNetCore.Routing.IEndpointRouteBuilder builder,
						bool first = true
					)
					{
						if (first)
						{
							return builder.MapLevel{{nextLevel}}()
								.WithGlobalRateLimitOnly();
						}

						return builder.MapLevel{{nextLevel}}()
							.WithGlobalRateLimitOnly();
					}

				"""
			);
		}

		helpers.Append(
			CultureInfo.InvariantCulture,
			$$"""
				public static RouteHandlerBuilder MapLevel{{branchDepth}}(
					this Microsoft.AspNetCore.Routing.IEndpointRouteBuilder builder
				) => builder.MapGet("/leaf", () => { })
					.WithGlobalRateLimitOnly();
			"""
		);

		var source =
			$$"""
				using Microsoft.AspNetCore.Builder;

				var app = new RouteBuilder();
				app.{|#0:MapLevel0|}();

				static class BranchyEndpointExtensions
				{
				{{helpers}}
				}
				""";

		await VerifyAsync(
			source,
			Verifier
				.Diagnostic(DiagnosticIds.PUBLY0011)
				.WithLocation(0)
				.WithArguments("MapLevel0")
		);
	}

	[Fact]
	public async Task ItShouldDeferSelfRecursiveMappingHelpers() {
		const string source = """
			using Microsoft.AspNetCore.Builder;

			var app = new RouteBuilder();
			app.MapRecursive();

			static class RecursiveEndpointExtensions
			{
				public static RouteHandlerBuilder MapRecursive(
					this Microsoft.AspNetCore.Routing.IEndpointRouteBuilder builder
				) => builder.MapRecursive();
			}
			""";

		await VerifyAsync(source);
	}

	// Overcorrection guard: the prior return-type heuristic also excluded
	// this helper, so it is not evidence that semantic terminality replaced it.
	[Fact]
	public async Task
	ItShouldIgnoreMapNamedRouteGroupHelpersReturningAnInterface() {
		const string source = """
			using Microsoft.AspNetCore.Builder;

			var app = new RouteBuilder();
			app.MapArea();
			""";

		await VerifyAsync(source);
	}

	[Fact]
	public async Task
	ItShouldIgnoreNonMappingEndpointBuilderConventions() {
		const string source = """
			using Microsoft.AspNetCore.Builder;

			var endpoint = new RouteHandlerBuilder();
			endpoint.AddEndpointFilter();
			""";

		await VerifyAsync(source);
	}

	[Fact]
	public async Task ItShouldRejectAnOptOutMarkerWithABlankReason() {
		const string source = """
			using Microsoft.AspNetCore.Builder;

			var app = new RouteBuilder();
			app.{|#0:MapGet|}("/health", () => { })
				.WithRateLimitOptOut("   ");
			""";

		await VerifyAsync(
			source,
			Verifier
				.Diagnostic(DiagnosticIds.PUBLY0011)
				.WithLocation(0)
				.WithArguments("MapGet")
		);
	}

	private static async Task VerifyAsync(
		string source,
		params DiagnosticResult[] expected
	) {
		var test = new CSharpAnalyzerTest<
			AnalyzerUnderTest,
			DefaultVerifier
		> {
			TestCode = source,
		};
		test.TestState.OutputKind =
			OutputKind.ConsoleApplication;
		test.TestState.Sources.Add(
			("EndpointStubs.cs", EndpointStubs)
		);
		test.TestState.Sources.Add(
			("UnrelatedStubs.cs", UnrelatedStubs)
		);
		test.TestState.AnalyzerConfigFiles.Add(
			("/.editorconfig", EnableConfig)
		);
		test.ExpectedDiagnostics.AddRange(expected);

		await test.RunAsync();
	}
}
