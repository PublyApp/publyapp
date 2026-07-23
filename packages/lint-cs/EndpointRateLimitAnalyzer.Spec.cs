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

		namespace Microsoft.AspNetCore.Builder
		{
			public sealed class RouteBuilder
			{
			}

			public static class EndpointExtensions
			{
				public static RouteBuilder MapGroup(
					this RouteBuilder builder,
					string pattern
				) => builder;

				public static RouteBuilder MapGet(
					this RouteBuilder builder,
					string pattern,
					Action handler
				) => builder;

				public static RouteBuilder RequireRateLimiting(
					this RouteBuilder builder,
					string policy
				) => builder;

				public static RouteBuilder RequireAnonymousAuthIpRateLimit(
					this RouteBuilder builder
				) => builder;

				public static RouteBuilder WithGlobalRateLimitOnly(
					this RouteBuilder builder
				) => builder;

				public static RouteBuilder WithRateLimitOptOut(
					this RouteBuilder builder,
					string reason
				) => builder;

				public static RouteBuilder DisableRateLimiting(
					this RouteBuilder builder
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
