using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Testing;
using Microsoft.CodeAnalysis.Testing;

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
		using System;

		namespace Microsoft.AspNetCore.Routing
		{
			public interface IEndpointRouteBuilder
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

			public sealed class RouteGroupBuilder
				: Microsoft.AspNetCore.Routing.IEndpointRouteBuilder,
					IEndpointConventionBuilder
			{
			}

			public sealed class RouteHandlerBuilder
				: Microsoft.AspNetCore.Routing.IEndpointRouteBuilder,
					IEndpointConventionBuilder
			{
			}

			public static class EndpointExtensions
			{
				public static RouteGroupBuilder MapGroup(
					this Microsoft.AspNetCore.Routing.IEndpointRouteBuilder builder,
					string pattern
				) => new RouteGroupBuilder();

				public static RouteHandlerBuilder MapGet(
					this Microsoft.AspNetCore.Routing.IEndpointRouteBuilder builder,
					string pattern,
					Action handler
				) => new RouteHandlerBuilder();

				public static RouteHandlerBuilder MapWidget(
					this Microsoft.AspNetCore.Routing.IEndpointRouteBuilder builder,
					string pattern,
					Action handler
				) => new RouteHandlerBuilder();

				public static IEndpointConventionBuilder MapArea(
					this Microsoft.AspNetCore.Routing.IEndpointRouteBuilder builder
				) => builder.MapGroup("/area");

				public static RouteHandlerBuilder AddEndpointFilter(
					this RouteHandlerBuilder builder
				) => builder;

				public static TBuilder RequireRateLimiting<TBuilder>(
					this TBuilder builder,
					string policy
				) where TBuilder : IEndpointConventionBuilder => builder;

				public static TBuilder RequireAnonymousAuthIpRateLimit<TBuilder>(
					this TBuilder builder
				) where TBuilder : IEndpointConventionBuilder => builder;

				public static TBuilder WithGlobalRateLimitOnly<TBuilder>(
					this TBuilder builder
				) where TBuilder : IEndpointConventionBuilder => builder;

				public static TBuilder WithRateLimitOptOut<TBuilder>(
					this TBuilder builder,
					string reason
				) where TBuilder : IEndpointConventionBuilder => builder;

				public static TBuilder DisableRateLimiting<TBuilder>(
					this TBuilder builder
				) where TBuilder : IEndpointConventionBuilder => builder;
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
		test.TestState.AnalyzerConfigFiles.Add(
			("/.editorconfig", EnableConfig)
		);
		test.ExpectedDiagnostics.AddRange(expected);

		await test.RunAsync();
	}
}
