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
///
/// Round-2 review (second pass) found two further problems, both fixed in this revision:
/// - The unset-host-environment case above still only reran the shipped
///   <c>--print-hosted-services</c> probe, not the actual document-generation pipeline #1019
///   calls out by name. <see cref="ItShouldResolveApiRoleDuringARealOpenApiDocumentGenerationRun"/>
///   closes that gap by invoking the REAL <c>dotnet-getdocument.dll</c> tool — the exact
///   executable <c>GenerateOpenApiDocuments</c>'s <c>&lt;Exec&gt;</c> line runs — against a
///   genuinely-compiled assembly (see <see cref="RealOpenApiDocGenerationFixture"/>).
/// - <c>RunProbe</c>'s 30-second timeout was unreachable for an ordinary hung child: synchronous
///   <c>ReadToEnd()</c> calls on stdout/stderr blocked forever before <c>WaitForExit</c> was ever
///   reached. <c>RunProcessWithTimeoutAsync</c> now races <c>WaitForExitAsync()</c> against the
///   timeout directly, with asynchronous stream reads running concurrently, and kills the whole
///   process tree on timeout instead of hanging the test process too.
/// </summary>
public sealed class AppEnvironmentDotEnvPrecedenceSpec
	: IClassFixture<RealOpenApiDocGenerationFixture>, IDisposable {
	private readonly RealOpenApiDocGenerationFixture _docGenFixture;
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

	public AppEnvironmentDotEnvPrecedenceSpec(RealOpenApiDocGenerationFixture docGenFixture) {
		_docGenFixture = docGenFixture;
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
	public async Task ItShouldResolveApiRoleWhenTheProcessExplicitlySetsAppRoleOverTheFilesAll() {
		WriteEnvFile(); // APP_ROLE="all" (the base/default value).

		var resolved = ParseHostedServices(await RunProbeAsync(
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
	public async Task ItShouldFallBackToTheFilesAppRoleWhenTheProcessNeverSetsIt() {
		WriteEnvFile(new Dictionary<string, string> { ["APP_ROLE"] = "api" });

		var resolved = ParseHostedServices(await RunProbeAsync(
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
	public async Task ItShouldResolveTheProcessFrontUrlOverTheFilesInvalidOne() {
		WriteEnvFile(new Dictionary<string, string> { ["FRONT_URL"] = "not-a-valid-url" });

		var result = await RunProbeAsync(
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
	// This case uses the shipped --print-hosted-services probe, not the real document-generation
	// pipeline — that gap is real and is closed separately below, by
	// ItShouldResolveApiRoleDuringARealOpenApiDocumentGenerationRun, which drives the actual
	// dotnet-getdocument tool instead of approximating it. This case still earns its keep
	// alongside that one: it is the cheap, fast-running form of the same environment
	// classification (no child-process host bootstrap, no hosted-service startup), so it stays
	// as a fast first signal while the real-pipeline case below is the authoritative one for
	// #1019's specific doc-generation acceptance requirement.
	[Fact]
	public async Task ItShouldResolveApiRoleUnderTheUnsetHostEnvironmentDocGenerationUses() {
		WriteEnvFile();

		var resolved = ParseHostedServices(await RunProbeAsync(
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

	// Round-2 review: every case above proves the precedence contract through the shipped
	// --print-hosted-services probe — a direct child process with both environment-name
	// variables removed. That is NOT the seam #1019 explicitly calls out:
	//
	// > confirm the justfile pins actually take effect, by asserting the role the application
	// > resolves during a doc-generation run — not by reading the recipe.
	//
	// This case closes that gap for real: it invokes the actual
	// Microsoft.Extensions.ApiDescription.Server tool (dotnet-getdocument.dll) — the exact
	// executable GenerateOpenApiDocuments's <Exec> line runs during `dotnet build`/
	// `just build-api` — against a genuinely-compiled (non-Test-config) PublyApp.Api.dll (see
	// RealOpenApiDocGenerationFixture), with the same APP_ROLE=api export `just build-api` uses
	// and the same unset host-environment classification build-time OpenAPI generation resolves
	// under.
	//
	// This is NOT a per-test full `dotnet build`: RealOpenApiDocGenerationFixture compiles the
	// assembly ONCE per test run (with OpenApiGenerateDocumentsOnBuild=false, so that one-time
	// compile never touches the checked-in apps/api/openapi.json). This case re-invokes the
	// already-compiled tool's own Exec command directly, bypassing MSBuild's Inputs/Outputs
	// up-to-date check on GenerateOpenApiDocuments (which would otherwise skip regeneration for
	// an unchanged assembly regardless of which env vars this case sets).
	//
	// Verified against a real regression (see the commit message for the transcript): reverting
	// AppEnvironment.cs to bare Env.Load(path) lets the file's APP_ROLE="all" win, resolving
	// AppRole.All and registering WorkerMigrationStartupGate INSIDE the real web host that the
	// real tool builds to extract the document — the same hosted-service graph that motivated
	// #1019, now actually started by the tool's own IHost.StartAsync() rather than merely
	// composed and inspected. Nothing in this process's environment can reach a real Postgres, so
	// that hosted service retries every 2 seconds (its RetryDelay) without ever completing, and
	// the real tool hangs — exactly the "worker path blocking an otherwise DB-less tooling
	// process" failure #1019 exists to prevent. RunProcessWithTimeoutAsync's fixed timeout (see
	// the round-2 fix on RunProbeAsync) is what lets this be caught deterministically here instead
	// of hanging the whole suite.
	[Fact]
	public async Task ItShouldResolveApiRoleDuringARealOpenApiDocumentGenerationRun() {
		WriteEnvFile(new Dictionary<string, string> { ["APP_ROLE"] = "all" });

		var outputDirectory = Path.Combine(_tempDirectory, "docgen-out");

		var startInfo = new ProcessStartInfo {
			FileName = "dotnet",
			WorkingDirectory = _tempDirectory,
			RedirectStandardOutput = true,
			RedirectStandardError = true,
			UseShellExecute = false,
		};
		startInfo.ArgumentList.Add(_docGenFixture.GetDocumentToolPath);
		startInfo.ArgumentList.Add("--assembly");
		startInfo.ArgumentList.Add(_docGenFixture.AssemblyPath);
		startInfo.ArgumentList.Add("--file-list");
		startInfo.ArgumentList.Add(Path.Combine(_tempDirectory, "docgen-filelist.cache"));
		startInfo.ArgumentList.Add("--framework");
		// Mirrors $(TargetFrameworkMoniker) for this project's single net10.0 TFM — the exact
		// value GenerateOpenApiDocuments' <Exec> line passes for this project.
		startInfo.ArgumentList.Add(".NETCoreApp,Version=v10.0");
		startInfo.ArgumentList.Add("--output");
		startInfo.ArgumentList.Add(outputDirectory);
		startInfo.ArgumentList.Add("--project");
		startInfo.ArgumentList.Add("PublyApp.Api");
		startInfo.ArgumentList.Add("--assets-file");
		startInfo.ArgumentList.Add(_docGenFixture.AssetsFilePath);

		startInfo.Environment.Remove("ASPNETCORE_ENVIRONMENT");
		startInfo.Environment.Remove("DOTNET_ENVIRONMENT");
		// Exactly `just build-api`'s export — the pin #1019 exists to protect.
		startInfo.Environment["APP_ROLE"] = "api";
		startInfo.Environment["TRUSTED_PROXY_CIDRS"] = "127.0.0.1/32,::1/128";

		var result = await RunProcessWithTimeoutAsync(startInfo, TimeSpan.FromSeconds(20));

		result.ExitCode.Should().Be(
			0,
			"the process's APP_ROLE=api must win over the file's APP_ROLE=\"all\" in the REAL " +
				"document-generation pipeline, exactly as `just build-api` relies on — a nonzero " +
				"exit or timeout here means the file clobbered the pin and the real tool either " +
				"failed validation or hung inside the worker hosted-service graph; " +
				$"stdout: {result.Stdout} stderr: {result.Stderr}");

		var generatedDocumentPath = Path.Combine(outputDirectory, "PublyApp.Api.json");
		File.Exists(generatedDocumentPath).Should().BeTrue(
			"the real dotnet-getdocument tool must have written the generated OpenAPI document " +
				$"to {generatedDocumentPath}; stdout: {result.Stdout} stderr: {result.Stderr}");

		var generatedDocument = File.ReadAllText(generatedDocumentPath);
		generatedDocument.Should().Contain(
			"/auth/login",
			"a real anonymous route must appear in the document the REAL tool generated, proving " +
				"the web host (Api/All role) actually ran and served the document request — the " +
				"Worker role's blocking Generic Host never reaches this code path at all");
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
	public async Task ItShouldNeverConsultTheFileForNonDevelopmentHostEnvironments(
		string hostEnvironment
	) {
		WriteEnvFile();

		var processOverrides = RequiredVariableNames
			.ToDictionary(name => name, string? (name) => null);
		var result = await RunProbeAsync(hostEnvironment, processOverrides);

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
	private Task<ProbeResult> RunProbeAsync(
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

		return RunProcessWithTimeoutAsync(startInfo, TimeSpan.FromSeconds(30));
	}

	// Round-2 fix: the ORIGINAL version of this method called the SYNCHRONOUS
	// process.StandardOutput.ReadToEnd() / StandardError.ReadToEnd() before ever calling
	// WaitForExit(30_000). A child that hangs while keeping either redirected stream open blocks
	// forever in ReadToEnd(), so the 30-second bound was never reached — verified directly: a
	// probe mutated to flush a valid manifest and then sleep indefinitely ran past an external
	// 8-second `timeout` (exit 124) while this method's own assertion never fired (see the commit
	// message for the transcript).
	//
	// Fixed by racing WaitForExitAsync() against Task.Delay(timeout) directly, with the stdout/
	// stderr reads running concurrently as their own tasks rather than gating the timeout behind
	// them. On timeout, the whole process tree is killed (not just the tracked process) — a
	// grandchild `dotnet` process can otherwise survive a single-PID kill and keep holding the
	// redirected pipes open, which is exactly the mechanism that orphaned a live process earlier
	// in this remediation (see the commit message) — so every caller of this helper must let it
	// own the kill, never send a bare SIGTERM/Kill() to `process` itself.
	private static async Task<ProbeResult> RunProcessWithTimeoutAsync(
		ProcessStartInfo startInfo,
		TimeSpan timeout
	) {
		using var process = Process.Start(startInfo);
		if (process is null) {
			throw new InvalidOperationException(
				"Failed to launch the child process for the probe.");
		}

		var stdoutTask = process.StandardOutput.ReadToEndAsync();
		var stderrTask = process.StandardError.ReadToEndAsync();
		var exitTask = process.WaitForExitAsync();

		var finished = await Task.WhenAny(exitTask, Task.Delay(timeout));
		if (finished != exitTask) {
			TryKillEntireProcessTree(process);

			var partialStdout = await ReadWithGraceAsync(stdoutTask);
			var partialStderr = await ReadWithGraceAsync(stderrTask);
			throw new TimeoutException(
				$"Child process did not exit within {timeout.TotalSeconds}s; killed the whole " +
					$"process tree. Partial stdout: {partialStdout} Partial stderr: {partialStderr}");
		}

		var stdout = await stdoutTask;
		var stderr = await stderrTask;
		return new ProbeResult(process.ExitCode, stdout, stderr);
	}

	private static void TryKillEntireProcessTree(Process process) {
		try {
			process.Kill(entireProcessTree: true);
		} catch (InvalidOperationException) {
			// The process exited between the timeout firing and this call — nothing to clean up.
		}
	}

	// Bounds the wait for a stream read after the process tree has already been killed. A
	// grandchild that survived the kill (or a stream whose handle is still draining) should never
	// re-hang the test itself — report what's available and move on.
	private static async Task<string> ReadWithGraceAsync(Task<string> readTask) {
		var finished = await Task.WhenAny(readTask, Task.Delay(TimeSpan.FromSeconds(5)));
		if (finished != readTask) {
			return "(unavailable — a surviving grandchild process may still hold the stream open)";
		}

		return await readTask;
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

/// <summary>
/// One-time (per test run), compile-only build of the REAL (non-Test-config) PublyApp.Api
/// assembly, shared across every case in <see cref="AppEnvironmentDotEnvPrecedenceSpec"/> via
/// <c>IClassFixture</c>. This is deliberately NOT a per-test full rebuild: xUnit constructs this
/// fixture once per test class run, regardless of how many test methods use it.
///
/// <c>OpenApiGenerateDocumentsOnBuild=false</c> is passed so this ONE-TIME compile never runs
/// doc generation itself and never touches the checked-in <c>apps/api/openapi.json</c>. Doc
/// generation is instead invoked directly (bypassing MSBuild's target entirely) once per test
/// case, against the assembly this fixture produces — see
/// <c>AppEnvironmentDotEnvPrecedenceSpec</c>'s
/// <c>ItShouldResolveApiRoleDuringARealOpenApiDocumentGenerationRun</c>.
/// </summary>
public sealed class RealOpenApiDocGenerationFixture : IDisposable {
	public string AssemblyPath { get; }
	public string AssetsFilePath { get; }
	public string GetDocumentToolPath { get; }

	public RealOpenApiDocGenerationFixture() {
		var apiProjectDirectory = FindApiProjectDirectory();

		var buildInfo = new ProcessStartInfo {
			FileName = "dotnet",
			WorkingDirectory = apiProjectDirectory,
			RedirectStandardOutput = true,
			RedirectStandardError = true,
			UseShellExecute = false,
		};
		buildInfo.ArgumentList.Add("build");
		buildInfo.ArgumentList.Add("--no-restore");
		buildInfo.ArgumentList.Add("-p:OpenApiGenerateDocumentsOnBuild=false");

		using var process = Process.Start(buildInfo);
		if (process is null) {
			throw new InvalidOperationException(
				"Failed to launch the one-time Debug-config compile for the real " +
					"doc-generation fixture.");
		}

		var stdout = process.StandardOutput.ReadToEnd();
		var stderr = process.StandardError.ReadToEnd();
		var exited = process.WaitForExit(milliseconds: 120_000);
		if (!exited) {
			process.Kill(entireProcessTree: true);
			throw new InvalidOperationException(
				"The one-time Debug-config compile did not finish within 120s. " +
					$"stdout: {stdout} stderr: {stderr}");
		}

		if (process.ExitCode != 0) {
			throw new InvalidOperationException(
				$"The one-time Debug-config compile failed (exit {process.ExitCode}).\n" +
					$"stdout: {stdout}\nstderr: {stderr}");
		}

		AssemblyPath = Path.Combine(
			apiProjectDirectory, ".artifacts", "bin", "PublyApp.Api", "Debug", "net10.0",
			"PublyApp.Api.dll");
		if (!File.Exists(AssemblyPath)) {
			throw new InvalidOperationException(
				$"Expected compiled assembly not found at {AssemblyPath}.");
		}

		AssetsFilePath = Path.Combine(
			apiProjectDirectory, ".artifacts", "obj", "PublyApp.Api", "project.assets.json");
		if (!File.Exists(AssetsFilePath)) {
			throw new InvalidOperationException(
				$"Expected NuGet assets file not found at {AssetsFilePath}.");
		}

		GetDocumentToolPath = FindDotNetGetDocumentTool();
	}

	public void Dispose() { }

	private static string FindDotNetGetDocumentTool() {
		var packagesRoot = Environment.GetEnvironmentVariable("NUGET_PACKAGES");
		if (string.IsNullOrWhiteSpace(packagesRoot)) {
			packagesRoot = Path.Combine(
				Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
				".nuget",
				"packages");
		}

		var packageDirectory = Path.Combine(packagesRoot, "microsoft.extensions.apidescription.server");
		if (!Directory.Exists(packageDirectory)) {
			throw new InvalidOperationException(
				$"Microsoft.Extensions.ApiDescription.Server package not found under " +
					$"{packagesRoot}. Restore the solution first.");
		}

		var versionDirectory = Directory.GetDirectories(packageDirectory)
			.OrderByDescending(path => path, StringComparer.OrdinalIgnoreCase)
			.FirstOrDefault();
		if (versionDirectory is null) {
			throw new InvalidOperationException(
				$"No version directories found under {packageDirectory}.");
		}

		var toolPath = Path.Combine(versionDirectory, "tools", "dotnet-getdocument.dll");
		if (!File.Exists(toolPath)) {
			throw new InvalidOperationException($"dotnet-getdocument.dll not found at {toolPath}.");
		}

		return toolPath;
	}

	// Walks up from the compiled test assembly's own directory (which lives under
	// apps/api/.artifacts/bin/PublyApp.Api.Tests/..., since apps/api/Directory.Build.props pins
	// DotNetArtifactsRoot for every project under apps/api to a shared apps/api/.artifacts/)
	// until it finds PublyApp.Api.csproj — the source project directory `just build-api` itself
	// builds from.
	private static string FindApiProjectDirectory() {
		var assemblyDirectory = Path.GetDirectoryName(typeof(Program).Assembly.Location);
		if (assemblyDirectory is null) {
			throw new InvalidOperationException("Could not determine the test assembly's directory.");
		}

		var directory = new DirectoryInfo(assemblyDirectory);
		while (directory is not null) {
			if (File.Exists(Path.Combine(directory.FullName, "PublyApp.Api.csproj"))) {
				return directory.FullName;
			}

			directory = directory.Parent;
		}

		throw new InvalidOperationException(
			"Could not locate apps/api (containing PublyApp.Api.csproj) by walking up from " +
				$"{assemblyDirectory}.");
	}
}
