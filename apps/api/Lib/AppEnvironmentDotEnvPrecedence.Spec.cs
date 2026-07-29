using System.Diagnostics;

using FluentAssertions;

using PublyApp.Api.Lib.Diagnostics;

using Xunit;

namespace PublyApp.Api.Lib;

/// <summary>
/// Pins #1019: <c>DotNetEnv.LoadOptions.NoClobber()</c> (AppEnvironment.cs,
/// <c>LoadDotEnvIfDevelopment</c>) must make an explicit process environment variable win
/// over the checked-in <c>.env.development</c> file's value for it, while a variable the
/// process never sets must still fall back to the file — for ANY dotenv-backed variable,
/// not only APP_ROLE.
///
/// Runs the REAL api assembly out-of-process via the <c>--print-hosted-services</c> probe
/// (<see cref="HostedServiceManifestCli"/>) against a synthetic, throwaway
/// <c>.env.development</c> in an isolated temp directory — never the repo's own file. No
/// Docker involved: POSTGRES_CONNECTION_STRING only needs to be well-formed
/// (<c>BeValidPostgresConnectionString</c> parses it with <c>NpgsqlConnectionStringBuilder</c>
/// and never connects), and the probe never calls <c>IHostedService.StartAsync</c>.
///
/// Round-2 review of this spec found two of its five assertions could pass for the wrong
/// reason:
/// - the fallback case used file APP_ROLE="all", which is ALSO Development's own default for
///   an absent APP_ROLE — so a mutation that silently ignored the file and applied the
///   language default still passed;
/// - every case observed only APP_ROLE, so a mutation that clobbered every OTHER dotenv key
///   (restoring just APP_ROLE around the old clobbering load) still passed all five.
/// It also found no case reproduces the unset-host-environment classification build-time
/// OpenAPI generation and `just build-api`'s APP_ROLE=api export actually run under — every
/// case forced ASPNETCORE_ENVIRONMENT=Development.
///
/// Fixed by: using a file value for the fallback case that DIFFERS from Development's default
/// (so silently defaulting instead of reading the file is observably wrong — see
/// <see cref="ItShouldFallBackToTheFilesAppRoleWhenTheProcessNeverSetsIt"/>); adding a
/// non-APP_ROLE variable (FRONT_URL) whose validity is used as a discriminator, so a
/// role-only-preserving mutation cannot satisfy the suite (see
/// <see cref="ItShouldResolveTheProcessFrontUrlOverTheFilesInvalidOne"/>); and adding a case
/// with BOTH host-environment variables genuinely unset (see
/// <see cref="ItShouldResolveApiRoleUnderTheUnsetHostEnvironmentDocGenerationUses"/>).
/// Every assertion below was verified against a real mutation that makes it fail — see the
/// commit message for the exact failing-then-passing transcript of each.
/// </summary>
public sealed class AppEnvironmentDotEnvPrecedenceSpec : IDisposable {
	// Registered only for the Worker/All roles (JobsServiceRegistration.AddWorkerServices) —
	// its presence/absence in the resolved hosted-service manifest is the observable proof of
	// which APP_ROLE actually won.
	private const string WorkerOnlyHostedServiceTypeName =
		"PublyApp.Api.Infrastructure.Jobs.WorkerMigrationStartupGate";

	private readonly string _tempDirectory;
	private readonly string _envFilePath;

	// Every AppEnvironment-required variable with a validator-passing placeholder (mirrors
	// .env.example). Individual tests override only the key(s) they care about — never share
	// a single fixed file across tests, so each case's file contents are exactly what that
	// case's comment claims.
	private static readonly Dictionary<string, string> BaseRequiredValues = new() {
		["APP_NAME"] = "PublyApp",
		["FRONT_URL"] = "http://localhost:5050",
		["POSTGRES_CONNECTION_STRING"] =
			"Host=localhost;Port=5454;Database=publyapp_precedence_test;" +
			"Username=postgres;Password=not-a-real-password",
		["RESEND_API_KEY"] = "not-a-real-key",
		["DEFAULT_EMAIL_SENDER_NAME"] = "PublyApp Support",
		["DEFAULT_EMAIL_SENDER_EMAIL"] = "no-reply@example.com",
		["STAFF_OWNER_EMAIL"] = "owner@example.com",
		["STAFF_OWNER_BOOTSTRAP_CODE"] = "not-a-real-code",
		["SESSION_TOKEN_HEADER_KEY"] = "X-Session-Token",
		["TENANT_ID_HEADER_KEY"] = "X-PublyApp-TenantId",
		["SESSION_EXPIRY_DAYS"] = "7",
		["PASSWORD_MIN_LENGTH"] = "12",
		["EMAIL_VERIFY_TOKEN_LENGTH"] = "25",
		["EMAIL_VERIFY_TOKEN_VALIDITY_DURATION"] = "7",
		["PASSWORD_RESET_TOKEN_LENGTH"] = "25",
		["PASSWORD_RESET_TOKEN_VALIDITY_DURATION"] = "7",
		["INVITATION_TOKEN_LENGTH"] = "32",
		["APP_ROLE"] = "all",
	};

	public AppEnvironmentDotEnvPrecedenceSpec() {
		_tempDirectory = Directory.CreateTempSubdirectory("publyapp-dotenv-precedence-").FullName;
		_envFilePath = Path.Combine(_tempDirectory, ".env.development");
	}

	public void Dispose() {
		Directory.Delete(_tempDirectory, recursive: true);
	}

	// Writes the synthetic .env.development for one test case: BaseRequiredValues with the
	// given overrides applied. Called explicitly per test (never in the constructor) so each
	// test's file contents are visible at its own call site, not shared/implicit.
	private void WriteEnvFile(IReadOnlyDictionary<string, string>? overrides = null) {
		var values = new Dictionary<string, string>(BaseRequiredValues);
		if (overrides is not null) {
			foreach (var (key, value) in overrides) {
				values[key] = value;
			}
		}

		var lines = values.Select(pair => $"{pair.Key}=\"{pair.Value}\"");
		File.WriteAllText(_envFilePath, string.Join('\n', lines));
	}

	[Fact]
	public void ItShouldResolveApiRoleWhenTheProcessExplicitlySetsAppRoleOverTheFilesAll() {
		WriteEnvFile(); // APP_ROLE="all" (the base/default value).

		var resolved = ParseHostedServices(RunProbe(
			hostEnvironment: "Development",
			processOverrides: new Dictionary<string, string?> { ["APP_ROLE"] = "api" }));

		resolved.Should().NotBeEmpty(
			"the api role starts at least the web host service, so a clean probe is non-empty");
		resolved.Should().NotContain(
			WorkerOnlyHostedServiceTypeName,
			"an explicit process APP_ROLE=api must win over .env.development's APP_ROLE=\"all\" " +
				"(#1019) — if the file clobbered it, the worker gate would be registered");
	}

	// Round-2 review: the ORIGINAL version of this test used file APP_ROLE="all" — which is
	// ALSO Development's own default for an absent APP_ROLE (AppEnvironment.cs,
	// IsAppRoleDefaultAllowed). That meant a mutation which silently applied the language
	// default instead of ever reading the file produced the identical observed graph, and the
	// test could not tell the difference. Verified directly: mutating
	// LoadDotEnvIfDevelopment() to delete APP_ROLE whenever the process had not set it (so the
	// file is genuinely never consulted for that key) still passed the original assertion.
	//
	// Fixed by using file APP_ROLE="api" — a value Development's default NEVER produces on its
	// own (the default is unconditionally "all"). If the file is genuinely consulted, the
	// worker gate is ABSENT (api role). If a bug instead silently fell back to the language
	// default, the worker gate would be PRESENT (all role) — the two outcomes are now
	// observably different, so this assertion has a real mutation that fails it.
	[Fact]
	public void ItShouldFallBackToTheFilesAppRoleWhenTheProcessNeverSetsIt() {
		WriteEnvFile(new Dictionary<string, string> { ["APP_ROLE"] = "api" });

		var resolved = ParseHostedServices(RunProbe(
			hostEnvironment: "Development",
			processOverrides: new Dictionary<string, string?> { ["APP_ROLE"] = null }));

		resolved.Should().NotBeEmpty(
			"the api role starts at least the web host service, so a clean probe is non-empty");
		resolved.Should().NotContain(
			WorkerOnlyHostedServiceTypeName,
			"omitting the process value entirely must fall back to the FILE's APP_ROLE=\"api\" " +
				"(#1019's other direction) — deliberately NOT \"all\", which is also " +
				"Development's own default for a missing APP_ROLE and would pass even if the " +
				"file were never consulted at all. The worker gate being present here would " +
				"mean the process silently defaulted instead of reading the file.");
	}

	// Round-2 review: every original case observed only APP_ROLE. A mutation that restored
	// process APP_ROLE around the old clobbering Env.Load(path) — leaving every OTHER dotenv
	// key vulnerable to the file — passed all five cases, because none of them checked
	// anything else. #1019's fix is repository-wide (any dotenv key, not a special case for
	// APP_ROLE), so at least one independently observable non-role variable must be checked
	// too.
	//
	// FRONT_URL's validity is the discriminator: the file's value fails
	// AppEnvironmentValidator.BeValidUrl outright, while the process's value is well-formed. If
	// NoClobber protects FRONT_URL like every other key, the process's valid value wins and
	// Initialize() (and therefore the whole probe) succeeds. If a mutation clobbers FRONT_URL
	// specifically (while leaving APP_ROLE alone, as the round-2 mutation did), the file's
	// invalid value wins, AppEnvironment.Initialize() throws before Program.Main ever reaches
	// the CLI probe dispatch, and the process exits non-zero with no EndMarker.
	[Fact]
	public void ItShouldResolveTheProcessFrontUrlOverTheFilesInvalidOne() {
		WriteEnvFile(new Dictionary<string, string> { ["FRONT_URL"] = "not-a-valid-url" });

		var result = RunProbe(
			hostEnvironment: "Development",
			processOverrides: new Dictionary<string, string?> {
				["APP_ROLE"] = "api",
				["FRONT_URL"] = "http://localhost:59999",
			});

		result.ExitCode.Should().Be(
			HostedServiceManifestCli.SuccessExitCode,
			"the process's well-formed FRONT_URL must win over the file's invalid one for " +
				"Initialize() to succeed at all; a clobbered FRONT_URL fails validation before " +
				$"the probe ever runs. stdout: {result.Stdout} stderr: {result.Stderr}");
		result.Stdout.Should().Contain(HostedServiceManifestCli.EndMarker);
	}

	// #1019 explicitly requires confirming the justfile's `just build-api`/EF-tooling
	// APP_ROLE=api export actually takes effect during a doc-generation run, not by reading
	// the recipe. Every case above forces ASPNETCORE_ENVIRONMENT=Development, which is NOT
	// that path: build-time OpenAPI generation runs with BOTH host-environment variables
	// unset (AppEnvironment.cs's own LoadDotEnvIfDevelopment comment; AGENTS.md). This case
	// reproduces that classification exactly — genuinely unset, not forced to any value — with
	// the same APP_ROLE=api export `just build-api` uses and file APP_ROLE="all".
	//
	// Unlike the Development fallback case above, there is no silent-default risk to guard
	// against here: with the host environment unset, AppEnvironment.IsAppRoleDefaultAllowed is
	// false (Development/Testing only), so an APP_ROLE genuinely missing from both process and
	// file fails fast requiring it explicitly — it does not quietly default to "all". A
	// resolved Api role here therefore specifically proves the process's export survived
	// the load, not a defaulting coincidence.
	//
	// This deliberately still uses the shipped --print-hosted-services probe rather than
	// invoking MSBuild's OpenApiGenerateDocuments target/dotnet-getdocument directly: both
	// dispatch from the identical Program.Main, after the identical
	// AppEnvironment.Initialize() call, under the identical environment classification, so the
	// precedence contract under test is exercised identically either way. Re-driving the
	// actual MSBuild doc-generation pipeline would re-test #1006's already-proven build wiring,
	// not #1019's precedence contract, at a real per-test full-rebuild cost.
	[Fact]
	public void ItShouldResolveApiRoleUnderTheUnsetHostEnvironmentDocGenerationUses() {
		WriteEnvFile();

		var resolved = ParseHostedServices(RunProbe(
			hostEnvironment: null,
			processOverrides: new Dictionary<string, string?> {
				["APP_ROLE"] = "api",
				// Required explicitly: the unset classification resolves to Production, and
				// the validator requires TRUSTED_PROXY_CIDRS explicitly set for a production
				// api role (AppEnvironment.cs's AppEnvironmentValidator).
				["TRUSTED_PROXY_CIDRS"] = "127.0.0.1/32,::1/128",
			}));

		resolved.Should().NotBeEmpty(
			"the api role starts at least the web host service, so a clean probe is non-empty");
		resolved.Should().NotContain(
			WorkerOnlyHostedServiceTypeName,
			"the process's APP_ROLE=api export — exactly what `just build-api` and the EF " +
				"tooling recipes rely on — must win over the file's APP_ROLE=\"all\" under the " +
				"SAME unset-host-environment classification build-time OpenAPI generation " +
				"resolves under; the worker gate being present would mean the file clobbered it " +
				"in the very path this issue exists to protect");
	}

	// Testing/Staging/Production must never reach LoadDotEnvIfDevelopment's DotNetEnv.Env.Load
	// call at all — confirmed here by observation, not by reading the early-return. The
	// synthetic .env.development supplies every required variable (including
	// POSTGRES_CONNECTION_STRING); the process supplies NONE of them. If the file were
	// consulted, Initialize() would succeed. If it is genuinely skipped, the very first
	// GetRequiredString call (POSTGRES_CONNECTION_STRING) throws before Program.Main ever
	// reaches the --print-hosted-services dispatch, so the process exits non-zero and the
	// exception naming that variable appears on stderr.
	[Theory]
	[InlineData("Testing")]
	[InlineData("Staging")]
	[InlineData("Production")]
	public void ItShouldNeverConsultTheFileForNonDevelopmentHostEnvironments(string hostEnvironment) {
		WriteEnvFile();

		var processOverrides = RequiredVariableNames
			.ToDictionary(name => name, string? (name) => null);
		var result = RunProbe(hostEnvironment, processOverrides);

		result.ExitCode.Should().NotBe(
			HostedServiceManifestCli.SuccessExitCode,
			$"{hostEnvironment} must never load .env.development, so the required " +
				"POSTGRES_CONNECTION_STRING the synthetic file supplies must be reported missing " +
				$"instead of resolving; stdout: {result.Stdout} stderr: {result.Stderr}");
		result.Stderr.Should().Contain(
			"POSTGRES_CONNECTION_STRING",
			"the failure must specifically be the first required variable the synthetic file " +
				"would have supplied — proving the file was never read, not merely that SOME " +
				"unrelated startup error occurred");
		result.Stdout.Should().NotContain(
			HostedServiceManifestCli.EndMarker,
			"Initialize() must throw before Program.Main ever reaches the CLI probe dispatch");
	}

	private static readonly string[] RequiredVariableNames = [
		"POSTGRES_CONNECTION_STRING",
		"FRONT_URL",
		"RESEND_API_KEY",
		"STAFF_OWNER_EMAIL",
		"STAFF_OWNER_BOOTSTRAP_CODE",
		"APP_NAME",
		"DEFAULT_EMAIL_SENDER_EMAIL",
		"DEFAULT_EMAIL_SENDER_NAME",
		"SESSION_TOKEN_HEADER_KEY",
		"TENANT_ID_HEADER_KEY",
		"APP_ROLE",
	];

	private sealed record ProbeResult(int ExitCode, string Stdout, string Stderr);

	// Spawns the shipped api assembly as an isolated child process with its working directory
	// pinned to the synthetic temp directory, so FindDotEnvPath's parent-walk can only ever
	// discover OUR throwaway file — never the repo's real one. `hostEnvironment` of null
	// leaves BOTH ASPNETCORE_ENVIRONMENT and DOTNET_ENVIRONMENT genuinely unset (the
	// build-time-OpenAPI-generation classification); any other value forces
	// ASPNETCORE_ENVIRONMENT to it. `processOverrides` sets (or, for a null value, removes) an
	// env var in the CHILD's process environment before it inherits the rest from this test
	// process — used both to inject an explicit value and to strip one this test process
	// might itself carry (e.g. a Testcontainers-supplied POSTGRES_CONNECTION_STRING), which
	// would otherwise mask the very condition under test.
	private ProbeResult RunProbe(
		string? hostEnvironment,
		IReadOnlyDictionary<string, string?> processOverrides
	) {
		var assemblyPath = typeof(Program).Assembly.Location;

		var startInfo = new ProcessStartInfo {
			FileName = Environment.ProcessPath ?? "dotnet",
			RedirectStandardOutput = true,
			RedirectStandardError = true,
			UseShellExecute = false,
			WorkingDirectory = _tempDirectory,
		};
		startInfo.ArgumentList.Add("exec");
		startInfo.ArgumentList.Add(assemblyPath);
		startInfo.ArgumentList.Add(HostedServiceManifestCli.PrintArg);

		if (hostEnvironment is null) {
			startInfo.Environment.Remove("ASPNETCORE_ENVIRONMENT");
		} else {
			startInfo.Environment["ASPNETCORE_ENVIRONMENT"] = hostEnvironment;
		}

		startInfo.Environment.Remove("DOTNET_ENVIRONMENT");

		foreach (var (key, value) in processOverrides) {
			if (value is null) {
				startInfo.Environment.Remove(key);
			} else {
				startInfo.Environment[key] = value;
			}
		}

		using var process = Process.Start(startInfo);
		if (process is null) {
			throw new InvalidOperationException(
				"Failed to launch the api assembly for the dotenv-precedence probe.");
		}

		var stdout = process.StandardOutput.ReadToEnd();
		var stderr = process.StandardError.ReadToEnd();
		process.WaitForExit(milliseconds: 30_000).Should().BeTrue(
			"the probe must finish promptly, not hang; stdout: " + stdout + " stderr: " + stderr);

		return new ProbeResult(process.ExitCode, stdout, stderr);
	}

	private static List<string> ParseHostedServices(ProbeResult result) {
		result.ExitCode.Should().Be(
			HostedServiceManifestCli.SuccessExitCode,
			"the probe composes and exits cleanly; stdout: " + result.Stdout +
				" stderr: " + result.Stderr);
		result.Stdout.Should().Contain(HostedServiceManifestCli.EndMarker);

		return result.Stdout
			.Split('\n')
			.Select(line => line.Trim())
			.Where(line => line.StartsWith(HostedServiceManifestCli.LinePrefix, StringComparison.Ordinal))
			.Select(line => line[HostedServiceManifestCli.LinePrefix.Length..])
			.ToList();
	}
}
