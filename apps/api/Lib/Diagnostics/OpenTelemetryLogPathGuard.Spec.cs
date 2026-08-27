using System.Text;
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
/// Two surfaces must stay locked:
/// <list type="bullet">
/// <item>the <strong>lockstep family</strong> of the five OTel packages declared in
///       <c>Directory.Packages.props</c> — the XML comment says they are pinned as one
///       family, so the spec parses every <c>Version="..."</c> for the five packages and
///       fails closed if any of them drift (cure #1 of the r2 brief).</item>
/// <item>the <strong>composition surface</strong> — every <c>*.cs</c> in <c>apps/api</c>
///       that contains OTel composition tokens. The previous spec read only the four
///       known files; a new composition file outside that set bypassed the guard
///       silently. The cure enumerates every file under <c>apps/api</c> that carries
///       an OTel composition token, aggregates them, and runs the detector over the
///       union (cure #2 of the r2 brief).</item>
/// </list>
///
/// Every detector is pinned by a fail-closed synthetic fixture so a refactor that
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

	// The repo root used by every repo-relative file lookup below. The
	// FindRepoFileText walk above handles a different job (test-bin upward search);
	// these guards need the actual repo root to enumerate `apps/api/**/*.cs`.
	private static DirectoryInfo FindRepoRoot() {
		var directory = new DirectoryInfo(AppContext.BaseDirectory);
		while (directory is not null) {
			if (Directory.Exists(Path.Combine(directory.FullName, "apps", "api")) &&
				File.Exists(Path.Combine(directory.FullName, "Directory.Packages.props"))) {
				return directory;
			}
			directory = directory.Parent!;
		}

		throw new InvalidOperationException(
			$"Could not locate repo root (apps/api + Directory.Packages.props) above {AppContext.BaseDirectory}"
		);
	}

	// Tokens that mark a file as an OTel COMPOSITION file (i.e. a file that wires
	// the SDK into a host). A file under apps/api that contains ANY of these
	// participates in the aggregate detector — so a new composition file added
	// outside the four files the r1 spec enumerated shows up here, exactly as the
	// brief requires.
	[GeneratedRegex(
		@"\bAddOpenTelemetry\s*\(|\bWithLogging\s*\(|\bWithTracing\s*\(|\bWithMetrics\s*\(|\bAddOtlpExporter\s*\("
	)]
	private static partial Regex OtelCompositionToken();

	// Every `*.cs` under apps/api that carries an OTel composition token. The
	// "LockstepFamily" / "SingleChain" detectors run over the concatenation of all
	// of these — so adding a NEW file that calls AddOpenTelemetry/WithLogging/
	// WithTracing/WithMetrics/AddOtlpExporter shifts the union and either
	// triggers a violation or is folded into the existing valid composition.
	private static IEnumerable<string> OtelCompositionFiles() {
		var apiDir = Path.Combine(FindRepoRoot().FullName, "apps", "api");
		foreach (var path in Directory.EnumerateFiles(apiDir, "*.cs", SearchOption.AllDirectories)) {
			// Skip the spec itself — it embeds the tokens as a deliberate
			// fail-closed fixture, not as a real composition.
			if (path.EndsWith("OpenTelemetryLogPathGuard.Spec.cs", StringComparison.Ordinal)) {
				continue;
			}

			// Skip test infra (under apps/api/Tests/, apps/api/Lib/Testing/, etc.)
			// — those files legitimately reference the OTel types in unit tests
			// and never become part of a real host composition. The Tests csproj
			// Compile includes under apps/api live under apps/api/Modules,
			// apps/api/Lib, apps/api/Infrastructure, apps/api/Migrations,
			// apps/api/Data — never under apps/api/Tests or apps/api/Lib/Testing.
			var rel = Path.GetRelativePath(apiDir, path)
				.Replace('\\', '/');
			if (rel.StartsWith("Tests/", StringComparison.Ordinal) ||
				rel.StartsWith("Lib/Testing/", StringComparison.Ordinal)) {
				continue;
			}

			var text = File.ReadAllText(path);
			if (OtelCompositionToken().IsMatch(text)) {
				yield return path;
			}
		}
	}

	// The aggregate composition source: every OTel-composition file in apps/api
	// concatenated, with file-boundary comments so a violation report can point
	// at the offender. The previous spec read one file; this reads the union.
	internal static string AggregateComposition {
		get {
			var sb = new StringBuilder();
			foreach (var file in OtelCompositionFiles()) {
				sb.Append("// === ").Append(Path.GetRelativePath(FindRepoRoot().FullName, file)).Append(" ===\n");
				sb.Append(File.ReadAllText(file));
				sb.Append('\n');
			}
			return sb.ToString();
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
	public void ItShouldKeepTheOtelCompositionFreeOfLogExportPaths() {
		var violations = DetectViolations(AggregateComposition);

		violations.Should().BeEmpty(
			because: "issue #255 forbids every OpenTelemetry LOGGING export path; " +
			"durable logs flow through the sanitized Serilog sinks only. " +
			"Scanned files: " + string.Join(", ", OtelCompositionFiles().Select(
				f => Path.GetRelativePath(FindRepoRoot().FullName, f))) +
			". Violations: " + string.Join("; ", violations)
		);
	}

	[Fact]
	public void ItShouldScanEveryOtelCompositionFileInAppsApi() {
		// Cure #2 of the r2 brief: the guard must enumerate the whole OTel
		// composition surface, not a hand-picked subset. At minimum, the
		// production composition file must show up — if it does not, the
		// enumeration is broken and the test fails loud.
		var files = OtelCompositionFiles().Select(
			f => Path.GetRelativePath(FindRepoRoot().FullName, f).Replace('\\', '/')
		).ToHashSet();

		files.Should().Contain(
			"apps/api/Lib/Diagnostics/OpenTelemetryConfigExtensions.cs",
			because: "the production composition file is the only sanctioned OTel wiring; " +
			"if it does not appear in the scanned set, the enumeration silently dropped it"
		);
	}

	[Fact]
	public void ItShouldWireBothHostBuildersThroughTheSingleExtension() {
		var programSource = FindRepoFileText("apps", "api", "Program.cs");

		ConfigureOpenTelemetryCall().Count(programSource)
			.Should().Be(2, because: "both the web host and the worker Generic Host must go " +
			"through the same gated extension — no host may compose telemetry directly");
	}

	// Matches a real package DECLARATION (PackageVersion/include),
	// not a documentation mention of the name in a comment — so the
	// explanatory note in Directory.Packages.props does not trip the guard.
	[GeneratedRegex(@"""Serilog\.Sinks\.OpenTelemetry""")]
	private static partial Regex SerilogOtelSinkDeclaration();

	[Fact]
	public void ItShouldForbidTheSerilogOpenTelemetrySinkPackage() {
		var packagesProps = FindRepoFileText("Directory.Packages.props");
		var apiCsproj = FindRepoFileText("apps", "api", "PublyApp.Api.csproj");

		SerilogOtelSinkDeclaration().IsMatch(packagesProps).Should().BeFalse(
			because: "that sink ships raw log events to an OTLP endpoint outside the sanitizer wrapper");
		SerilogOtelSinkDeclaration().IsMatch(apiCsproj).Should().BeFalse(
			because: "that sink ships raw log events to an OTLP endpoint outside the sanitizer wrapper");
	}

	// ===========================================================================
	// Lockstep family (cure #1 of the r2 brief): the five OpenTelemetry packages
	// declared in Directory.Packages.props must all carry the SAME Version="..."
	// value. The XML comment claims "Deliberately pinned as one lockstep family";
	// this detector is the only thing that makes that claim load-bearing.
	// ===========================================================================

	// The five OpenTelemetry packages the r2 brief names. Adding a sixth
	// package means the lockstep claim is now wider than the test — fix the
	// test alongside the props file.
	internal static readonly string[] LockstepFamily = [
		"OpenTelemetry.Extensions.Hosting",
		"OpenTelemetry.Instrumentation.AspNetCore",
		"OpenTelemetry.Instrumentation.Http",
		"OpenTelemetry.Instrumentation.Runtime",
		"OpenTelemetry.Exporter.OpenTelemetryProtocol",
	];

	// Captures the Version="..." value of a <PackageVersion Include="NAME" Version="X" />
	// line. The NAME is matched against the supplied list separately so we can
	// report which package is at the wrong version.
	[GeneratedRegex(@"<PackageVersion\s+Include\s*=\s*""(?<name>[^""]+)""\s+Version\s*=\s*""(?<version>[^""]+)""\s*/>")]
	private static partial Regex PackageVersionDeclaration();

	// Maps each OTel package name to its declared Version. Packages not present
	// in the supplied props text are reported under a sentinel so the failure
	// says "this package is missing" instead of silently dropping it.
	internal static IReadOnlyDictionary<string, string> ResolveLockstepFamily(string propsText) {
		var declared = new Dictionary<string, string>(StringComparer.Ordinal);
		foreach (Match m in PackageVersionDeclaration().Matches(propsText)) {
			var name = m.Groups["name"].Value;
			var version = m.Groups["version"].Value;
			declared[name] = version;
		}

		var resolved = new Dictionary<string, string>(StringComparer.Ordinal);
		foreach (var name in LockstepFamily) {
			resolved[name] = declared.TryGetValue(name, out var v)
				? v
				: "<missing>";
		}

		return resolved;
	}

	internal static IReadOnlyList<string> DetectLockstepDrift(string propsText) {
		var resolved = ResolveLockstepFamily(propsText);
		var violations = new List<string>();

		// Every package must be present.
		foreach (var (name, version) in resolved) {
			if (version == "<missing>") {
				violations.Add(
					$"lockstep-family package '{name}' has no <PackageVersion> declaration in Directory.Packages.props"
				);
			}
		}

		// Every package must share the same Version="..." value as the others.
		// We compute the set of declared (non-missing) versions and fail if it
		// contains more than one distinct value — independent of which package
		// drifted, so a synthetic fixture that flips any single Version="..."
		// trips the detector.
		var distinct = resolved.Values
			.Where(v => v != "<missing>")
			.Distinct(StringComparer.Ordinal)
			.ToList();
		if (distinct.Count > 1) {
			var detail = string.Join(
				", ",
				resolved.Select(kv => $"{kv.Key}={kv.Value}")
			);
			violations.Add(
				$"OpenTelemetry lockstep family desynchronized — every package must share the same Version. Found: {detail}"
			);
		}

		return violations;
	}

	[Fact]
	public void ItShouldPinTheOpenTelemetryLockstepFamilyToOneVersion() {
		var packagesProps = FindRepoFileText("Directory.Packages.props");
		var drift = DetectLockstepDrift(packagesProps);

		drift.Should().BeEmpty(
			because: "the Directory.Packages.props comment claims the five OTel packages are pinned as one lockstep family; " +
			"this guard is the only thing that makes that claim true. Drift: " + string.Join("; ", drift)
		);
	}

	// Fail-closed theory pin for the lockstep detector: feed an injected props
	// text where ONE package has been bumped to a different version, and
	// require the detector to flag it. Without this pin, a refactor that
	// turns DetectLockstepDrift into `return [];` would still leave every
	// green test green.
	[Theory]
	[InlineData(
		// Synthetic props: the runtime instrumentation package is bumped from
		// 1.18.0 to 1.19.0 — the canonical "one caret flip desyncs the family"
		// case the r2 brief calls out.
		"<PackageVersion Include=\"OpenTelemetry.Extensions.Hosting\" Version=\"1.18.0\" />\n" +
		"<PackageVersion Include=\"OpenTelemetry.Instrumentation.AspNetCore\" Version=\"1.18.0\" />\n" +
		"<PackageVersion Include=\"OpenTelemetry.Instrumentation.Http\" Version=\"1.18.0\" />\n" +
		"<PackageVersion Include=\"OpenTelemetry.Instrumentation.Runtime\" Version=\"1.19.0\" />\n" +
		"<PackageVersion Include=\"OpenTelemetry.Exporter.OpenTelemetryProtocol\" Version=\"1.18.0\" />\n"
	)]
	[InlineData(
		// Synthetic props: every package has a different version — the family
		// is fully shattered, the detector must still flag exactly one
		// "desynchronized" violation (distinct.Count > 1), not a per-package
		// cascade.
		"<PackageVersion Include=\"OpenTelemetry.Extensions.Hosting\" Version=\"1.18.0\" />\n" +
		"<PackageVersion Include=\"OpenTelemetry.Instrumentation.AspNetCore\" Version=\"1.18.1\" />\n" +
		"<PackageVersion Include=\"OpenTelemetry.Instrumentation.Http\" Version=\"1.18.2\" />\n" +
		"<PackageVersion Include=\"OpenTelemetry.Instrumentation.Runtime\" Version=\"1.18.3\" />\n" +
		"<PackageVersion Include=\"OpenTelemetry.Exporter.OpenTelemetryProtocol\" Version=\"1.18.4\" />\n"
	)]
	[InlineData(
		// Synthetic props: a package from the family is missing entirely.
		"<PackageVersion Include=\"OpenTelemetry.Extensions.Hosting\" Version=\"1.18.0\" />\n" +
		"<PackageVersion Include=\"OpenTelemetry.Instrumentation.AspNetCore\" Version=\"1.18.0\" />\n" +
		"<PackageVersion Include=\"OpenTelemetry.Instrumentation.Http\" Version=\"1.18.0\" />\n" +
		"<PackageVersion Include=\"OpenTelemetry.Exporter.OpenTelemetryProtocol\" Version=\"1.18.0\" />\n"
	)]
	public void ItShouldDetectLockstepFamilyDriftFailClosed(string offendingProps) {
		DetectLockstepDrift(offendingProps).Should().NotBeEmpty(
			because: $"the lockstep guard must flag this desynchronized family. Input: {offendingProps}"
		);
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

	[GeneratedRegex(@"\.ConfigureOpenTelemetry\s*\(\)")]
	private static partial Regex ConfigureOpenTelemetryCall();
}
