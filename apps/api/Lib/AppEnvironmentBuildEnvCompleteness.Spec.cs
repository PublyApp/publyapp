using System.Text.RegularExpressions;

using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Lib;

/// <summary>
/// Build/environment completeness guard (hotfix for the develop-red regression from
/// #1239): <c>AppEnvironment.Initialize()</c> requires
/// <c>SOCIAL_ACCOUNTS_MASTER_KEY</c>, but every non-dev entrypoint that boots the app
/// must supply it — including the Dockerfile's two build-time stages (doc-gen publish
/// and the migrations bundle) and the front-e2e stack's api/migrate containers. When
/// the Dockerfile missed the variable, <c>Build e2e images</c> failed on every develop
/// push, and nothing caught it locally.
///
/// This spec enumerates the REQUIRED variable set from the real
/// <c>AppEnvironment.cs</c> source (every <c>GetRequiredString</c>/<c>GetRequiredInt</c>
/// argument, plus the Production-gated <c>TRUSTED_PROXY_CIDRS</c>) instead of a
/// hand-copied list, so adding a required variable without teaching the build surfaces
/// about it fails here first. It asserts each required variable appears in:
/// - <c>apps/api/Dockerfile</c> — in EVERY <c>ASPNETCORE_ENVIRONMENT=Production</c>
///   block (today both the publish/doc-gen stage and the migrations-bundle stage boot
///   the app under Production). Since #1294 this is asserted PER BLOCK, not by a
///   file-wide occurrence count: “appears ≥ 2 times” stayed green even when a new
///   third Production block omitted the variable entirely — exactly the defect class
///   this guard exists for;
/// - <c>apps/front/docker-compose.test.yml</c> — the e2e stack's shared api/migrate
///   runtime environment anchor;
/// - <c>docs/deployment/first-deploy-runbook.md</c> — the operator's REQUIRED table.
///
/// <c>TRUSTED_PROXY_CIDRS</c> is appended explicitly: it is technically
/// <c>GetOptional*</c> (loopback default) but validator-rejected when absent for a
/// Production api role, and every guarded surface already pins it for exactly that
/// reason.
///
/// The extractor itself is pinned by
/// <see cref="ItShouldExtractTheKnownRequiredSetFailClosed"/> so a refactor of
/// AppEnvironment that silences the regex turns the whole guard red instead of letting
/// the surface checks pass vacuously — a guard must be able to detect its intended
/// defect.
/// </summary>
public sealed partial class AppEnvironmentBuildEnvCompletenessSpec {
	private const string PlaceholderMasterKey =
		"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

	// Optional-by-code but Production-required-for-api (validator gate); every booting
	// non-dev surface that pins APP_ROLE pins this too, so it joins the guarded set.
	private static readonly string[] AdditionalSurfacesVariables = ["TRUSTED_PROXY_CIDRS"];

	private static string FindRepoFileText(params string[] relativeParts) {
		var directory = new DirectoryInfo(AppContext.BaseDirectory);

		while (directory is not null) {
			var candidate = Path.Combine([directory.FullName, .. relativeParts]);
			if (File.Exists(candidate)) {
				return File.ReadAllText(candidate);
			}

			directory = directory.Parent;
		}

		throw new InvalidOperationException(
			$"Could not locate '{string.Join('/', relativeParts)}' above the test "
			+ "output directory; if the file moved, update this guard."
		);
	}

	[GeneratedRegex(
		"GetRequired(?:String|Int)\\(\\s*(?:nameof\\(([A-Za-z_][A-Za-z0-9_]*)\\)|\"([A-Za-z_][A-Za-z0-9_]*)\")"
	)]
	private static partial Regex RequiredReaderRegex();

	/// <summary>
	/// Splits a Dockerfile into the env blocks that follow an
	/// <c>ASPNETCORE_ENVIRONMENT=Production</c> marker line: the marker line itself plus
	/// every following line until one stops ending in a backslash continuation.
	/// </summary>
	internal static IReadOnlyList<string> SplitProductionBlocks(string dockerfile) {
		var blocks = new List<string>();
		List<string>? current = null;

		foreach (var line in dockerfile.Split('\n')) {
			if (line.Contains("ASPNETCORE_ENVIRONMENT=Production", StringComparison.Ordinal)) {
				if (current is not null) {
					blocks.Add(string.Join("\n", current));
				}

				current = [line];
			} else if (current is not null) {
				current.Add(line);
				if (!line.TrimEnd('\r').EndsWith('\\')) {
					blocks.Add(string.Join("\n", current));
					current = null;
				}
			}
		}

		if (current is not null) {
			blocks.Add(string.Join("\n", current));
		}

		return blocks;
	}

	/// <summary>
	/// Returns one human-readable “block N is missing X” entry per (block, required
	/// variable) pair the block does not satisfy. Shared verbatim by the green theory
	/// and the red scratch-block proof so they cannot drift apart.
	/// </summary>
	internal static IReadOnlyList<string> CollectMissingVariablesPerProductionBlock(
		string dockerfile,
		IReadOnlyList<string> variableNames
	) {
		var violations = new List<string>();
		var blocks = SplitProductionBlocks(dockerfile);

		for (var index = 0; index < blocks.Count; index++) {
			foreach (var name in variableNames) {
				if (!blocks[index].Contains(name, StringComparison.Ordinal)) {
					violations.Add($"block {index + 1} is missing {name}");
				}
			}
		}

		return violations;
	}

	/// <summary>
	/// Appends a plausible THIRD Production env block to <paramref name="dockerfile"/>
	/// that carries every required variable EXCEPT <paramref name="omittedVariable"/>
	/// (drawn from the live extractor, so it never drifts as AppEnvironment evolves).
	/// Used by the red-proof to demonstrate the guard detects the defect it exists for.
	/// </summary>
	private static string AppendScratchThirdProductionBlockOmitting(
		string dockerfile,
		string omittedVariable
	) {
		var lines = new List<string> {
			"RUN cd apps/api \\",
			"\t&& ASPNETCORE_ENVIRONMENT=Production \\",
			"\tDOTNET_ENVIRONMENT=Production \\",
			"\tAPP_ROLE=api \\",
		};

		lines.AddRange(CollectRequiredSurfaceVariables()
			.Where(name => name != omittedVariable)
			.Select(name => $"\t{name}=\"scratch-placeholder\" \\"));

		lines.Add("\tdotnet publish -c Release -o /publish");

		return dockerfile + "\n" + string.Join("\n", lines);
	}

	private static IReadOnlyList<string> CollectRequiredSurfaceVariables() {
		var source = FindRepoFileText("apps", "api", "Lib", "AppEnvironment.cs");

		// Matches GetRequiredString(nameof(X)) / GetRequiredString("LITERAL") and the
		// GetRequiredInt pair — the fail-fast readers whose variables every process
		// that boots the app must supply. The helper DEFINITIONS do not match (their
		// argument is a parameter, not nameof/a literal), so only real read sites do.
		var matches = RequiredReaderRegex().Matches(source);

		var names = new List<string>();
		foreach (Match match in matches) {
			var name = match.Groups[1].Success
				? match.Groups[1].Value
				: match.Groups[2].Value;
			if (!names.Contains(name)) {
				names.Add(name);
			}
		}

		foreach (var extra in AdditionalSurfacesVariables) {
			if (!names.Contains(extra)) {
				names.Add(extra);
			}
		}

		return names;
	}

	public static TheoryData<string> RequiredSurfaceVariables() {
		var data = new TheoryData<string>();
		foreach (var name in CollectRequiredSurfaceVariables()) {
			data.Add(name);
		}

		return data;
	}

	[Fact]
	public void ItShouldExtractTheKnownRequiredSetFailClosed() {
		// Pins the extractor: if AppEnvironment's reader calls are ever renamed or
		// reshaped past the regex above, this fails FIRST and the surface checks below
		// never pass vacuously.
		var names = CollectRequiredSurfaceVariables();

		names.Should().Contain("POSTGRES_CONNECTION_STRING");
		names.Should().Contain("RESEND_API_KEY");
		names.Should().Contain("STAFF_OWNER_EMAIL");
		names.Should().Contain("SESSION_TOKEN_HEADER_KEY");
		names.Should().Contain("INVITATION_TOKEN_LENGTH");
		names.Should().Contain("SOCIAL_ACCOUNTS_MASTER_KEY");
		names.Should().Contain("TRUSTED_PROXY_CIDRS");
		names.Count.Should().BeGreaterThanOrEqualTo(12);
	}

	[Theory]
	[MemberData(nameof(RequiredSurfaceVariables))]
	public void ItShouldProvideEveryRequiredVariableInEveryDockerfileProductionBlock(
		string variableName
	) {
		var dockerfile = FindRepoFileText("apps", "api", "Dockerfile");

		// Both the publish stage (OpenAPI doc-gen boots the app) and the migrations
		// stage (dotnet ef migrations bundle) run under Production with APP_ROLE=api,
		// so EACH carries its own inline env block — and any FUTURE Production block
		// must carry the full required set too. Assert per block, never by file-wide
		// occurrence count: a count passes even when a new block omits the variable.
		SplitProductionBlocks(dockerfile).Count.Should().BeGreaterThanOrEqualTo(2,
			"because the publish/doc-gen and migrations stages both boot under "
				+ "ASPNETCORE_ENVIRONMENT=Production; fewer blocks means a stage moved "
				+ "or was renamed and this guard must be re-taught");

		CollectMissingVariablesPerProductionBlock(dockerfile, [variableName])
			.Should().BeEmpty(
				"because EVERY ASPNETCORE_ENVIRONMENT=Production block boots the app for "
					+ "real; a block missing {0} fails that image build with \"Environment "
					+ "variable '{0}' is not set\"",
				variableName);
	}

	[Fact]
	public void ItShouldGoRedOnAScratchThirdProductionBlockWithoutTheMasterKey() {
		// Paired proof for #1294: take the REAL Dockerfile and append a scratch THIRD
		// ASPNETCORE_ENVIRONMENT=Production block carrying every required variable EXCEPT
		// SOCIAL_ACCOUNTS_MASTER_KEY (generated from the extractor so it cannot drift).
		// Under the retired file-wide “appears at least twice” rule this defect passed
		// silently; the per-block guard must flag exactly that block and variable.
		var real = FindRepoFileText("apps", "api", "Dockerfile");

		var scratched = AppendScratchThirdProductionBlockOmitting(real,
			"SOCIAL_ACCOUNTS_MASTER_KEY");
		var violations = CollectMissingVariablesPerProductionBlock(
			scratched,
			CollectRequiredSurfaceVariables()
		);

		violations.Should().BeEquivalentTo(
			[$"block 3 is missing SOCIAL_ACCOUNTS_MASTER_KEY"],
			"a Production block without the master key must turn the guard red — "
				+ "and ONLY that omission, proving the other blocks stay satisfied"
		);

		// Sanity: the same checker on the UNMODIFIED Dockerfile stays green, so the red
		// above is attributable to the scratch block alone.
		CollectMissingVariablesPerProductionBlock(
			real,
			CollectRequiredSurfaceVariables()
		).Should().BeEmpty();
	}

	[Theory]
	[MemberData(nameof(RequiredSurfaceVariables))]
	public void ItShouldProvideEveryRequiredVariableInTheE2eStackRuntimeEnvironment(
		string variableName
	) {
		var compose = FindRepoFileText("apps", "front", "docker-compose.test.yml");

		compose.Should().Contain(
			variableName,
			"because the front-e2e stack's api/migrate containers boot the app for "
			+ "real; a build-only fix crash-loops them at startup without it ({0})",
			variableName
		);
	}

	[Theory]
	[MemberData(nameof(RequiredSurfaceVariables))]
	public void ItShouldDocumentEveryRequiredVariableInTheDeployRunbook(
		string variableName
	) {
		var runbook = FindRepoFileText(
			"docs", "deployment", "first-deploy-runbook.md"
		);

		runbook.Should().Contain(
			variableName,
			"because the operator REQUIRED table is where a missing {0} is diagnosed "
			+ "from a crash-looping deployment",
			variableName
		);
	}

	[Fact]
	public void ItShouldKeepTheDockerfilePlaceholderObviouslyNonSecret() {
		var dockerfile = FindRepoFileText("apps", "api", "Dockerfile");

		// The build-time value must satisfy ParseMasterKey (base64, exactly 32 bytes)
		// while being recognizably NOT a real key: the all-zero 32-byte key is the
		// repo's documented build placeholder (quality-gate.yml, justfile, .env.example).
		// Pinning the exact constant keeps both build stages aligned with the rest of
		// the tooling and prevents a genuine secret from being pasted into a committed
		// file. It protects nothing: the witness skips its canary check in the doc-gen
		// path (canaryStore null), and the placeholder is never used for real crypto.
		dockerfile.Should().Contain(
			PlaceholderMasterKey,
			"because the committed all-zero build placeholder is deliberately "
				+ "non-secret and shared by quality-gate.yml and the just recipes"
		);
	}
}
