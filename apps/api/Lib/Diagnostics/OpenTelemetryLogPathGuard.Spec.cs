using System.Text.RegularExpressions;

using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Lib.Diagnostics;

/// <summary>
/// Issue #255 structural guard: the OpenTelemetry wiring must export TRACES AND METRICS
/// ONLY — never logs. Every durable log line flows through the single Serilog
/// <c>WriteTo.Sanitized(...)</c> wrapper (invariant R2-8/R3-5/O13); a default OTel logger
/// provider would be a SECOND export path outside that sanitizer.
///
/// Like <c>AppEnvironmentBuildEnvCompleteness.Spec</c>, this reads the real source files
/// instead of asserting on a copy, so any edit that introduces a logging export path
/// fails here first. The detector itself is pinned by
/// <see cref="ItShouldDetectInjectedLogExportTokensFailClosed"/> so a refactor that
/// silences the patterns turns the whole guard red instead of passing vacuously.
/// </summary>
public sealed partial class OpenTelemetryLogPathGuardSpec {
	private static string FindRepoFileText(params string[] relativeParts) {
		var directory = new DirectoryInfo(AppContext.BaseDirectory);

		while (directory is not null) {
			var candidate = Path.Combine([directory.FullName, .. relativeParts]);
			if (File.Exists(candidate)) {
				return File.ReadAllText(candidate);
			}

			directory = directory.Parent!;
		}

		throw new InvalidOperationException(
			$"Could not locate {string.Join('/', relativeParts)} above {AppContext.BaseDirectory}"
		);
	}

	private static string CompositionSource {
		get {
			return FindRepoFileText(
		"apps", "api", "Lib", "Diagnostics", "OpenTelemetryConfigExtensions.cs"
	);
		}
	}

	[GeneratedRegex(@"\bWithLogging\s*\(")]
	private static partial Regex WithLoggingCall();

	[GeneratedRegex(@"\.AddOpenTelemetry\s*\(")]
	private static partial Regex AddOpenTelemetryChain();

	[GeneratedRegex(@"\.AddOtlpExporter\s*\(")]
	private static partial Regex OtlpExporterCall();

	// Returns every violated rule for the given composition source; empty = compliant.
	// Internal + operating on injected text so the fail-closed pin can exercise it.
	internal static IReadOnlyList<string> DetectViolations(string source) {
		var violations = new List<string>();

		if (WithLoggingCall().IsMatch(source)) {
			violations.Add("OTel logging builder (WithLogging) registers a log export path");
		}

		if (AddOpenTelemetryChain().Count(source) > 1) {
			violations.Add(
				"more than one AddOpenTelemetry chain — the single traces+metrics chain is the only sanctioned composition"
			);
		}

		// Exactly two exporters are expected: one for tracing, one for metrics. A third
		// call today means someone attached OTLP to a logging builder.
		if (OtlpExporterCall().Count(source) != 2) {
			violations.Add(
				$"expected exactly 2 AddOtlpExporter() calls (tracing + metrics), found {OtlpExporterCall().Count(source)}"
			);
		}

		return violations;
	}

	[Fact]
	public void ItShouldKeepTheOtelpCompositionFreeOfLogExportPaths() {
		var violations = DetectViolations(CompositionSource);

		violations.Should().BeEmpty(
			because: "issue #255 forbids every OpenTelemetry LOGGING export path; " +
			"durable logs flow through the sanitized Serilog sinks only. Violations: " +
			string.Join("; ", violations)
		);
	}

	[Fact]
	public void ItShouldWireBothHostBuildersThroughTheSingleExtension() {
		var programSource = FindRepoFileText("apps", "api", "Program.cs");

		MyRegex().Count(programSource)
			.Should().Be(2, because: "both the web host and the worker Generic Host must go " +
			"through the same gated extension — no host may compose telemetry directly");
	}

	[Fact]
	public void ItShouldForbidTheSerilogOpenTelemetrySinkPackage() {
		var packagesProps = FindRepoFileText("Directory.Packages.props");
		var apiCsproj = FindRepoFileText("apps", "api", "PublyApp.Api.csproj");

		packagesProps.Should().NotContain("Serilog.Sinks.OpenTelemetry",
			because: "that sink ships raw log events to an OTLP endpoint outside the sanitizer wrapper");
		apiCsproj.Should().NotContain("Serilog.Sinks.OpenTelemetry",
			because: "that sink ships raw log events to an OTLP endpoint outside the sanitizer wrapper");
	}

	// A guard must be able to detect its intended defect (see
	// AppEnvironmentBuildEnvCompleteness.Spec for the precedent): feed synthetic
	// offending sources and require the detector to flag each one.
	[Theory]
	[InlineData("builder.WithLogging(logging => { });")]
	[InlineData("services.AddOpenTelemetry().WithLogging(); x.AddOpenTelemetry();")]
	[InlineData(".WithTracing(t => t.AddOtlpExporter()).WithMetrics(m => m.AddOtlpExporter()).WithLogging(l => l.AddOtlpExporter());")]
	public void ItShouldDetectInjectedLogExportTokensFailClosed(string offendingSource) {
		DetectViolations(offendingSource).Should().NotBeEmpty(
			because: $"the guard must flag this injected defect: {offendingSource}"
		);
	}

	[GeneratedRegex(@"\.ConfigureOpenTelemetry\(\)")]
	private static partial Regex MyRegex();
}
