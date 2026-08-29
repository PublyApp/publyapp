using System.Text;
using System.Text.RegularExpressions;

using FluentAssertions;

using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

// Architecture containment guard (#1319): the boot-log probe argument
// (--emit-canary-boot-log) must stay reachable ONLY through its test-only gate. The
// runtime hard-reject (CanaryBootLogProbeGuardSpec, real child processes) proves the
// refusal; THIS spec proves containment of every other path that could arm or bypass it:
//
//  1. No shipped C# source outside Lib/Diagnostics/CanaryBootLogProbe.cs may activate,
//     reference, or assemble the probe arg/flag identifiers — so no second call site can
//     spring up that arms the probe without the gate.
//  2. No container/deploy manifest (Dockerfile, dokploy.yml, docker-compose*.yml,
//     .env.example, .env.*) may pass the arg or set PUBLYAPP_TEST_BOOT_PROBE — a
//     misconfigured `command:` was exactly the #1319 outage scenario.
//
// Mechanism (same as JobEnqueueBoundarySpec): sources are lexed by ROSLYN
// (Microsoft.CodeAnalysis.CSharp), not a hand-rolled scanner; string/char literal text is
// masked in the code view (interpolation holes stay visible) and comments are dropped, so
// neither a mention inside a comment nor inside a string can hide executable code.
// Residual gap (documented): a facade that never names the probe's type, arg, flag, or
// sink cannot be detected lexically — but in C# it also cannot REACH any of them without
// naming them somewhere, which is exactly what this spec scans for.
public sealed partial class CanaryProbeContainmentSpec {
	// The COMPLETE sanctioned wiring set: every shipped, non-test file allowed to touch
	// the probe machinery, and the exact calls each must keep contributing. The artifact
	// BEHAVIOR of these sites is proven by the runtime child-process specs
	// (CanaryBootLogProbeGuardSpec, MasterKeyWitnessBootIntegrationSpec); THIS table only
	// closes the SET — any fourth file referencing the probe (a second activator, a
	// stray exit ramp, a sink attach outside the logger wrapper) turns the spec red.
	private static readonly Dictionary<string, string[]> SanctionedWiring = new() {
		["Lib/Diagnostics/CanaryBootLogProbe.cs"] = [
			"bool ActivateIfRequested(string[] args)",
			"TryExitAfterBootGate",
			"AttachSinkIfRequested",
		],
		["Program.cs"] = [
			"CanaryBootLogProbe.ActivateIfRequested(args);",
			"CanaryBootLogProbe.TryExitAfterBootGate()",
		],
		["Lib/Extensions/LoggerConfigExtensions.cs"] = [
			"CanaryBootLogProbe.AttachSinkIfRequested(",
		],
	};

	[Fact]
	public void ItShouldReferenceTheProbeExactlyThroughTheSanctionedWiringSet() {
		var apiRoot = FindApiRoot();
		var wired = new Dictionary<string, List<string>>();

		foreach (
			var file in Directory.EnumerateFiles(
				apiRoot,
				"*.cs",
				SearchOption.AllDirectories
			)
		) {
			var relative = Path.GetRelativePath(apiRoot, file)
				.Replace('\\', '/');

			if (ShouldSkip(relative)) {
				continue;
			}

			var findings = FindProbeWiring(File.ReadAllText(file));
			if (findings.Count > 0) {
				wired.Add(relative, findings);
			}
		}

		wired.Keys.Should().BeEquivalentTo(
			SanctionedWiring.Keys,
			"the probe arg/flag must stay reachable ONLY through its definition file, "
				+ "Program.Main's sanctioned activation/exit-ramp calls, and the logger "
				+ "wrapper's sink attach — any additional site could arm or read the "
				+ "probe outside the test-only gate (#1319). Wired files with findings:\n"
				+ string.Join(
					"\n",
					wired.Select(kv => $"{kv.Key}: {string.Join(", ", kv.Value)}")
				)
		);
	}

	[Fact]
	public void ItShouldKeepTheExpectedProbeCallsAtEverySanctionedSite() {
		var apiRoot = FindApiRoot();
		var missing = new List<string>();

		foreach (
			var (relative, expectedSnippets) in SanctionedWiring
		) {
			var source = File.ReadAllText(
				Path.Combine(apiRoot, relative)
			);

			foreach (var snippet in expectedSnippets) {
				if (!source.Contains(snippet, StringComparison.Ordinal)) {
					missing.Add($"{relative}: '{snippet}'");
				}
			}
		}

		missing.Should().BeEmpty(
			"removing or renaming a sanctioned probe call silently disarms either the "
				+ "capture path or the exit ramp; the runtime specs would go red too, "
				+ "but this pins the structural expectation directly. Missing:\n"
				+ string.Join("\n", missing)
		);
	}

	[Fact]
	public void ItShouldNeverPassTheProbeArgOrFlagThroughDeployManifests() {
		var repoRoot = FindRepoRoot();
		var offenders = new List<string>();
		var unreadable = new List<string>();

		foreach (var relative in DeployManifests()) {
			var path = Path.Combine(repoRoot, relative);
			if (!File.Exists(path)) {
				// Fail loud, never silently skip: a manifest that vanished or was renamed
				// must be reconciled here, not quietly dropped from the scan.
				unreadable.Add(relative);
				continue;
			}

			string content;
			try {
				content = File.ReadAllText(path);
			} catch (Exception exception) {
				// Round-1 fix (#1319 review): an unreadable manifest must fail the scan
				// loudly instead of being skipped.
				unreadable.Add($"{relative} ({exception.GetType().Name})");
				continue;
			}

			if (content.Contains(ProbeEmitArgText)
				|| content.Contains(ProbeFlagNameText)
			) {
				offenders.Add(relative);
			}
		}

		unreadable.Should().BeEmpty(
			"the containment scan is only as strong as its manifest list: a listed "
				+ "manifest that cannot be read means the list drifted from the repo "
				+ "(renamed/moved file) or the file became unreadable — reconcile it "
				+ "instead of scanning around it. Unreadable manifests:\n"
				+ string.Join("\n", unreadable)
		);

		offenders.Should().BeEmpty(
			"a deployed container passing --emit-canary-boot-log gets the clean-looking "
				+ "exit-78 refusal instead of its intended workload — and without the "
				+ "#1319 guard it would have been a silent exit-0 outage. These manifests "
				+ "must never pass the probe arg or set its flag. Offenders:\n"
				+ string.Join("\n", offenders)
		);
	}

	// The containment detector is only as strong as what it provably detects: exercised
	// against known-bad wirings (including comment/string camouflage and interpolation
	// holes) and known-good look-alikes, not just the currently-clean tree.
	[Fact]
	public void ItShouldCatchKnownBypassFormattingsInTheDetectorItself() {
		string[] knownBad = [
			"CanaryBootLogProbe.ActivateIfRequested(args);",
			"if (CanaryBootLogProbe.TryExitAfterBootGate()) { return; }",
			// Reflection-style reach still names the type.
			"var probeType = typeof(CanaryBootLogProbe);",
			"var sink = new BootLogCaptureSink();",
			"--emit-canary-boot-log",
			"PUBLYAPP_TEST_BOOT_PROBE",
			// Executable call hidden in an interpolation hole.
			"var s = $\"{CanaryBootLogProbe.ActivateIfRequested(args)}\";"
		];

		string[] knownGood = [
			// Comments never trigger (the live Program.cs carries such prose).
			"#1319: the probe arg without PUBLYAPP_TEST_BOOT_PROBE exits 78.",
			// A string nested in documentation prose stays silent.
			"A string merely documenting the refusal message.",
			// Adjacent literals that only ASSEMBLE the arg text are accepted, same
			// documented stance as JobEnqueueBoundarySpec's known-good corpus: the
			// assembled value still has to reach a ProcessStartInfo/args sink somewhere,
			// which the manifest scan and the runtime child-process specs cover.
			"var s = \"--emit-canary\" + \"-boot-log\";",
			// A different type whose name merely CONTAINS the probe type as a
			// substring: the whole-word regexes must not fire.
			"CanaryBootLogProbeGuardSpec.EnforceGate();",
			"BootLogCaptureSinkSnapshotReader.Read(snapshot);"
		];

		foreach (var snippet in knownBad) {
			FindProbeWiring(snippet).Should().NotBeEmpty(
				$"detector must catch: {snippet}"
			);
		}

		foreach (var snippet in knownGood) {
			FindProbeWiring(snippet).Should().BeEmpty(
				$"detector must not flag: {snippet}"
			);
		}
	}

	// Specs and test-only harnesses may reference the probe (the runtime specs do);
	// obj/bin/artifacts output is not source.
	private static bool ShouldSkip(string relativePath) {
		return relativePath.Contains("/obj/")
			|| relativePath.Contains("/bin/")
			|| relativePath.Contains(".artifacts/")
			|| relativePath.EndsWith(".Spec.cs", StringComparison.Ordinal)
			|| relativePath.StartsWith(
				"Lib/Testing/",
				StringComparison.Ordinal
			);
	}

	// Repo-root-relative paths a misconfigured container command or env file could
	// travel through. Extend when deployment topology changes. Round-1 fix (#1319
	// review): the reviewer noted launchSettings.json and the front compose files were
	// omitted — every committed file that can inject environment variables or carry a
	// launch command must be scanned, so the detector covers every file that can carry
	// the probe arg or its flag.
	private static IEnumerable<string> DeployManifests() {
		return [
			"apps/api/Dockerfile",
			"dokploy.yml",
			"apps/api/Properties/launchSettings.json",
			"apps/front/docker-compose.test.yml",
			"apps/front/docker-compose.fork-overlay.yml",
			".env.example",
		];
	}

	// Code view: literal TEXT masked, hole expressions visible, comments gone.
	// Strings view: literal text visible, comments gone. A hit in EITHER view flags.
	private static List<string> FindProbeWiring(string source) {
		var (codeOnly, withStrings) = RenderViews(source);
		var findings = new List<string>();

		foreach (var (name, pattern) in WiringPatterns) {
			if (pattern.IsMatch(codeOnly)) {
				findings.Add(name);
			}
		}

		if (withStrings.Contains(ProbeEmitArgText, StringComparison.Ordinal)
			|| withStrings.Contains(ProbeFlagNameText, StringComparison.Ordinal)
			// A string naming the probe TYPE covers reflection-style reach
			// (Activator.CreateInstance(typeof(CanaryBootLogProbe)) ...).
			|| ProbeTypeName().IsMatch(withStrings)
		) {
			findings.Add("arg/flag assembled in string literals");
		}

		return findings;
	}

	private static readonly (string Name, Regex Pattern)[] WiringPatterns = [
		("activates the probe", ActivateCall()),
		("reads the probe exit ramp", ExitRampCall()),
		("names the probe type directly", ProbeTypeName()),
		("constructs the capture sink", SinkConstruction()),
		("carries the emit arg as code", EmitArgCode()),
		("carries the flag name as code", FlagCode()),
	];

	private static readonly string ProbeEmitArgText = "--emit-canary-boot-log";
	private static readonly string ProbeFlagNameText = "PUBLYAPP_TEST_BOOT_PROBE";

	[GeneratedRegex(@"\bActivateIfRequested\s*\(", RegexOptions.IgnoreCase)]
	private static partial Regex ActivateCall();

	[GeneratedRegex(@"\bTryExitAfterBootGate\s*\(", RegexOptions.IgnoreCase)]
	private static partial Regex ExitRampCall();

	[GeneratedRegex(@"\bCanaryBootLogProbe\b")]
	private static partial Regex ProbeTypeName();

	[GeneratedRegex(@"new\s+BootLogCaptureSink\s*\(", RegexOptions.IgnoreCase)]
	private static partial Regex SinkConstruction();

	[GeneratedRegex(
		@"--emit\s*-\s*canary\s*-\s*boot\s*-\s*log",
		RegexOptions.IgnoreCase
	)]
	private static partial Regex EmitArgCode();

	[GeneratedRegex(
		@"PUBLYAPP\s*_\s*TEST\s*_\s*BOOT\s*_\s*PROBE",
		RegexOptions.IgnoreCase
	)]
	private static partial Regex FlagCode();

	// String/char literal TEXT tokens, blanked in the masked view (same token-kind set
	// as JobEnqueueBoundarySpec).
	private static readonly HashSet<SyntaxKind> LiteralTextTokenKinds = [
		SyntaxKind.StringLiteralToken,
		SyntaxKind.SingleLineRawStringLiteralToken,
		SyntaxKind.MultiLineRawStringLiteralToken,
		SyntaxKind.Utf8StringLiteralToken,
		SyntaxKind.Utf8SingleLineRawStringLiteralToken,
		SyntaxKind.Utf8MultiLineRawStringLiteralToken,
		SyntaxKind.CharacterLiteralToken,
		SyntaxKind.InterpolatedStringTextToken
	];

	private static (string CodeOnly, string WithStrings) RenderViews(
		string source
	) {
		var root = CSharpSyntaxTree.ParseText(source).GetRoot();
		var masked = new StringBuilder(source.Length);
		var unmasked = new StringBuilder(source.Length);

		foreach (
			var token in root.DescendantTokens(descendIntoTrivia: false)
		) {
			AppendTrivia(masked, unmasked, token.LeadingTrivia);

			var text = token.Text;
			unmasked.Append(text);
			masked.Append(
				LiteralTextTokenKinds.Contains(token.Kind())
					? new string(' ', text.Length)
					: text
			);

			AppendTrivia(masked, unmasked, token.TrailingTrivia);
		}

		return (masked.ToString(), unmasked.ToString());
	}

	private static void AppendTrivia(
		StringBuilder masked,
		StringBuilder unmasked,
		SyntaxTriviaList triviaList
	) {
		foreach (var trivia in triviaList) {
			if (trivia.IsDirective) {
				var blank = new string(' ', trivia.FullSpan.Length);
				masked.Append(blank);
				unmasked.Append(blank);
				continue;
			}

			if (trivia.IsKind(SyntaxKind.SingleLineCommentTrivia)
				|| trivia.IsKind(SyntaxKind.MultiLineCommentTrivia)
				|| trivia.IsKind(SyntaxKind.SingleLineDocumentationCommentTrivia)
				|| trivia.IsKind(SyntaxKind.MultiLineDocumentationCommentTrivia)
			) {
				masked.Append(' ');
				unmasked.Append(' ');
				continue;
			}

			var text = trivia.ToFullString();
			masked.Append(text);
			unmasked.Append(text);
		}
	}

	// The test assembly runs from apps/api/.artifacts/bin/...; walk up until the
	// directory containing PublyApp.Api.csproj (the apps/api root).
	private static string FindApiRoot() {
		var current = new DirectoryInfo(AppContext.BaseDirectory);

		while (current is not null) {
			if (File.Exists(
					Path.Combine(current.FullName, "PublyApp.Api.csproj")
				)
			) {
				return current.FullName;
			}

			current = current.Parent;
		}

		throw new InvalidOperationException(
			"Could not locate the apps/api root (PublyApp.Api.csproj) above "
				+ AppContext.BaseDirectory
		);
	}

	// Walk further up for the repo root containing justfile (manifest paths are
	// repo-root-relative).
	private static string FindRepoRoot() {
		var current = new DirectoryInfo(AppContext.BaseDirectory);

		while (current is not null) {
			if (File.Exists(Path.Combine(current.FullName, "justfile"))) {
				return current.FullName;
			}

			current = current.Parent;
		}

		throw new InvalidOperationException(
			"Could not locate the repo root (justfile) above "
				+ AppContext.BaseDirectory
		);
	}
}
