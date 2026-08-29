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
/// Round-2 review (second pass) found two further problems, both fixed in that revision:
/// - The unset-host-environment case above still only reran the shipped
///   <c>--print-hosted-services</c> probe, not the actual document-generation pipeline #1019
///   calls out by name. <see cref="ItShouldResolveApiRoleDuringARealOpenApiDocumentGenerationRun"/>
///   closed that gap by invoking the REAL <c>dotnet-getdocument.dll</c> tool directly against a
///   separately-compiled assembly, with the process manually setting APP_ROLE=api itself.
/// - <c>RunProbe</c>'s 30-second timeout was unreachable for an ordinary hung child: synchronous
///   <c>ReadToEnd()</c> calls on stdout/stderr blocked forever before <c>WaitForExit</c> was ever
///   reached. <c>RunProcessWithTimeoutAsync</c> now races <c>WaitForExitAsync()</c> against the
///   timeout directly, with asynchronous stream reads running concurrently, and kills the whole
///   process tree on timeout instead of hanging the test process too.
///
/// Round-3 review found the fix above still fell short of #1019's acceptance criterion, plus a
/// recurrence of the round-2 timeout bug and a real safety defect, all fixed in this revision:
/// - <see cref="ItShouldResolveApiRoleDuringARealOpenApiDocumentGenerationRun"/> supplied its own
///   <c>APP_ROLE=api</c> below both integration boundaries, so it proved <c>NoClobber()</c>
///   preserves a manually-injected value in the real tool — not that the repository's own
///   <c>just build-api</c> pin (justfile:101) actually takes effect. Verified: mutating the
///   recipe's default from <c>$APP_ROLE="api"</c> to <c>$APP_ROLE="all"</c> left the old version
///   of this test green. Fixed by invoking the real <c>just build-api</c> recipe itself — letting
///   ITS OWN default parameter export the role, never injecting it from the test — via an
///   auto-discovered <c>MSBuild.rsp</c> response file placed next to
///   <c>PublyApp.Api.csproj</c> (MSBuild appends its lines as extra command-line arguments
///   automatically). That redirects <c>GenerateOpenApiDocuments</c>' output to a throwaway
///   directory: command-line (global) MSBuild properties cannot be overridden by the csproj's
///   own unconditional <c>&lt;OpenApiJsonFile&gt;</c>/<c>&lt;OpenApiDocumentsDirectory&gt;</c>
///   assignments, so the checked-in <c>apps/api/openapi.json</c> is never touched — verified
///   directly by hash before/after every run. The one-time-compiled-assembly fixture this
///   replaced (<c>RealOpenApiDocGenerationFixture</c>) is gone: there is no longer any reason to
///   compile a throwaway copy of the assembly when the case drives the real recipe/real project
///   directly.
/// - That same removed fixture's one-time compile step used the exact synchronous
///   <c>ReadToEnd()</c>-before-<c>WaitForExit</c> ordering round-2 rejected, making ITS OWN
///   120-second timeout unreachable too — the second time this ordering shipped on this branch.
///   Deleting the fixture deletes the bug; the replacement drives the recipe entirely through
///   <see cref="RunProcessWithTimeoutAsync"/>, the one helper in this file with the correct
///   async-read/<c>WaitForExitAsync</c> race.
/// - The synthetic <c>POSTGRES_CONNECTION_STRING</c> every case in this file shares
///   (<see cref="BaseRequiredValues"/>) pointed at port 5454 — this repository's actual shared
///   local development PostgreSQL endpoint (Aspire AppHost, port 5454). The real
///   document-generation case genuinely starts the hosted-service graph when no-clobber
///   regresses (see below), so a permanent regression test using that port could reach a real,
///   shared database the moment the production fix broke. Fixed by pointing it at a closed local
///   port (1) that can never accept a real connection, with a short connection timeout — the
///   probe-based cases only need a well-formed connection string (never dialed). The real-recipe
///   case ALSO never lets its own invocation reach the repository's real <c>.env.development</c>
///   at all: see its own comment for why an earlier revision that relied on a process-level
///   override instead was itself unsafe under exactly this defect (verified by direct
///   reproduction — it read migration state from this machine's real development Postgres).
///
/// Round-4 review found the real-recipe case above was still not database-safe, plus two
/// unrelated build-hygiene defects in the same case, all fixed in this revision:
/// - On the EXACT <c>build-api $APP_ROLE="all"</c> mutation this case exists to catch, the
///   worker used the TEST ASSEMBLY's own inherited POSTGRES_CONNECTION_STRING (set
///   process-wide by <see cref="PublyApp.Api.Lib.Testing.Fixtures.TestEnvironment"/>'s module
///   initializer —
///   "Host=localhost" with no port, i.e. Npgsql's default 5432) instead of the synthetic
///   file's value, and made real connection attempts to localhost:5432. The code removed only
///   ASPNETCORE_ENVIRONMENT/DOTNET_ENVIRONMENT from the child's inherited environment;
///   POSTGRES_CONNECTION_STRING was left to inherit from the test process, so under CORRECT
///   (non-regressed) NoClobber(), the child's ALREADY-SET inherited value beat the file — the
///   file's safety was irrelevant on that path. Fixed by explicitly setting the child's
///   POSTGRES_CONNECTION_STRING to the exact same
///   <see cref="UnreachablePostgresConnectionString"/> the synthetic file also carries:
///   whichever side NoClobber() makes win — process (correct behavior) or file (regressed
///   behavior) — the value actually used is now identical and safe, instead of depending on
///   which side happens to prevail. Combined with pointing that shared constant at 192.0.2.1
///   (TEST-NET-1, RFC 5737 — never a real host, unlike "port 1 is probably closed"), no path
///   through this case can reach a real listener structurally, not by chance of which port
///   happened to be free on the machine running it.
/// - A passing run left <c>PublyApp.Api.OpenApiFiles.cache</c> newer than the API DLL and
///   pointing at this test's already-deleted temp output directory. The cache file itself is
///   NOT redirected by the MSBuild.rsp trick above (its path is fixed under
///   <c>.artifacts/obj</c>, only the DOCUMENT outputs are redirected), so <c>just build-api</c>'s
///   own run regenerates it in place, poisoned. The next real <c>GenerateOpenApiDocuments</c>
///   invocation on that machine — a developer's next build, or a later CI/local-gate step —
///   then saw its Outputs (the cache) newer than its Inputs (the DLL) and skipped generation
///   entirely, exiting 0 without regenerating anything. Round 4 attempted to fix this by
///   restoring the original bytes in <c>finally</c>, but <c>File.WriteAllBytes</c> gave the
///   restored file a new timestamp, preserving the silent-skip defect. Fixed by redirecting
///   <c>_OpenApiDocumentsCache</c> into the throwaway output directory too, so the shared cache
///   is never deleted or rewritten. The test asserts both its bytes and timestamp are unchanged.
/// - The case overwrote and deleted a pre-existing <c>apps/api/MSBuild.rsp</c> unconditionally:
///   unlike the synthetic <c>.env.development</c> above, it had no pre-existence guard, so a
///   developer's own response file would simply be eaten. Its writes also preceded the
///   <c>try/finally</c> entirely, so a failure while creating the synthetic dotenv (verified
///   by making <c>apps/api/.env.development</c> an unwriteable directory) left the
///   just-written response file behind — cleanup never registered before the failure. Fixed
///   by (a) adding the same refuse-to-run guard the dotenv path already has, so a real
///   developer file is never touched at all, and (b) replacing the single <c>try/finally</c>
///   with a <c>cleanupActions</c> list where each destructive step (cache delete, rsp write,
///   dotenv write) registers its own rollback IMMEDIATELY after it succeeds and before the
///   next destructive step runs — so a later failure only ever unwinds what has actually
///   happened so far, in reverse order, instead of leaving earlier writes stranded.
/// </summary>
public sealed class AppEnvironmentDotEnvPrecedenceSpec : IDisposable {
	// Registered only for the Worker/All roles (JobsServiceRegistration.AddWorkerServices) —
	// its presence/absence in the resolved hosted-service manifest is the observable proof of
	// which APP_ROLE actually won.
	private const string WorkerOnlyHostedServiceTypeName =
		"PublyApp.Api.Infrastructure.Jobs.WorkerMigrationStartupGate";

	private readonly string _tempDirectory;
	private readonly string _envFilePath;

	// Round-4 review: a closed LOCAL port ("Host=localhost;Port=1") is not a structural
	// safety boundary — it depends on nothing happening to listen on this machine. The
	// real-recipe case proved that the *local-port* half of the argument was never even
	// the operative one: under NoClobber() regressed, the file's value is what's used, but
	// under NoClobber() CORRECT (the shipped, non-regressed behavior), the child process
	// inherits whatever POSTGRES_CONNECTION_STRING the test host process itself has set
	// (TestEnvironment.cs's module-initializer placeholder, "Host=localhost" with no port —
	// i.e. Npgsql's default 5432), and NoClobber correctly preserves THAT over the file. So
	// the file's port choice was irrelevant on the passing/no-clobber-correct path; only the
	// bare-Env.Load regression path ever dialed the file's value at all.
	//
	// Fixed by pointing every case's synthetic connection string at 192.0.2.1 — TEST-NET-1
	// (RFC 5737), reserved specifically for documentation/examples and never assigned to a
	// real host. Unlike "probably nothing listens on port 1 on this machine", this is not
	// probabilistic: no real database can ever legitimately answer at this address, on any
	// machine, independent of what happens to be running locally. `Timeout=1` bounds any
	// connection attempt regardless of how the network stack responds to the reserved
	// address (immediate reject, or silent drop until Npgsql's own timeout fires).
	private const string UnreachablePostgresConnectionString =
		"Host=192.0.2.1;Port=1;Database=publyapp_precedence_test;" +
		"Username=postgres;Password=not-a-real-password;Timeout=1";

	// Every AppEnvironment-required variable with a validator-passing placeholder (mirrors
	// .env.example). Individual tests override only the key(s) they care about — never share
	// a single fixed file across tests, so each case's file contents are exactly what that
	// case's comment claims.
	private static readonly Dictionary<string, string> BaseRequiredValues = new() {
		["APP_NAME"] = "PublyApp",
		["FRONT_URL"] = "http://localhost:5050",
		// Round-3 review: this MUST NOT be port 5454 — this repository's actual shared local
		// development PostgreSQL endpoint (Aspire AppHost). The probe-based cases
		// below never dial it (BeValidPostgresConnectionString only parses it), but the real
		// document-generation case DOES start the hosted-service graph when no-clobber
		// regresses, and a permanent regression test is explicitly designed to activate that
		// graph on a regression. Round-4 review: a closed local port is not enough of a
		// safety boundary either — see UnreachablePostgresConnectionString's own comment.
		["POSTGRES_CONNECTION_STRING"] = UnreachablePostgresConnectionString,
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
	// Round-3 review: the FIRST version of this case closed that gap only partway — it invoked
	// the real dotnet-getdocument.dll tool, but supplied APP_ROLE=api itself
	// (startInfo.Environment["APP_ROLE"] = "api"), below both the `just` and MSBuild boundaries.
	// That proved NoClobber() preserves a manually-injected value in the real tool; it did NOT
	// prove the repository's own justfile:101 pin actually takes effect. Verified directly:
	// mutating build-api's default from $APP_ROLE="api" to $APP_ROLE="all" left that version
	// green (see the commit message for the transcript).
	//
	// This version closes the real gap: it invokes `just build-api` ITSELF as a child process,
	// with no explicit role override at all, so the recipe's OWN default parameter
	// (justfile:101) is what exports APP_ROLE — a mutation of that default now changes what this
	// case observes. Three things make that safe and deterministic to run as a permanent test:
	//
	// 1. Output redirection without touching the checked-in document. `just build-api` runs
	//    `dotnet build --no-restore` against the REAL apps/api project, and
	//    GenerateOpenApiDocuments' Outputs (OpenApiJsonFile/OpenApiDocumentsDirectory) are
	//    hardcoded in PublyApp.Api.csproj to $(MSBuildProjectDirectory) — i.e. the checked-in
	//    apps/api/openapi.json. An "MSBuild.rsp" file dropped next to PublyApp.Api.csproj is
	//    auto-included by MSBuild as extra command-line arguments; command-line (global)
	//    properties CANNOT be overridden by the csproj's own unconditional property
	//    assignments (unlike a plain -p: passed to a recipe that doesn't forward extra args, or
	//    an environment variable, either of which the csproj's unconditional assignment would
	//    win over). That redirects every one of OpenApiJsonFile/OpenApiDocumentsDirectory/
	//    OpenApiGeneratedProjectFile to this test's own throwaway directory. Verified directly:
	//    the checked-in apps/api/openapi.json's hash is identical before and after every run
	//    (clean and mutated) — see the commit message.
	// 2. Forcing real regeneration every run. GenerateOpenApiDocuments itself has an
	//    Inputs="$(TargetPath)"/Outputs="$(_OpenApiDocumentsCache)" incremental-build check
	//    — if it uses the shared .artifacts/obj cache and that file is already up to date,
	//    MSBuild silently skips the target and this test writes nothing. The response file
	//    redirects _OpenApiDocumentsCache into the fresh throwaway output directory, so the
	//    target always executes without deleting or rewriting the shared cache.
	// 3. NEVER touching the repository's own .env.development — this is the safety-critical
	//    one. `just build-api`'s recipe `cd`s into apps/api before running `dotnet build`, so
	//    FindDotEnvPath's parent-walk (Lib/AppEnvironment.cs) starts THERE. It returns the FIRST
	//    ".env.development" it finds while walking up — and apps/api never has its own in normal
	//    operation (only the repo root does). Placing a throwaway, fully-controlled
	//    ".env.development" directly in apps/api therefore intercepts the walk before it ever
	//    reaches the repo root, using the exact same parent-walk mechanism every other case in
	//    this file already relies on for isolation (WorkingDirectory = an isolated temp
	//    directory). This was NOT the first version of this fix: an earlier revision set
	//    POSTGRES_CONNECTION_STRING as a PROCESS environment override instead and let the
	//    invocation read the repo's real .env.development, reasoning that NoClobber would keep
	//    the process override in charge. That reasoning was circular — the whole point of
	//    exercising a REGRESSED NoClobber is that the file wins over EVERY process value, not
	//    just APP_ROLE — and it was caught by direct reproduction: with AppEnvironment.cs
	//    reverted to bare Env.Load(path), that version connected to and read migration state
	//    from this machine's real Aspire AppHost Postgres at :5454 (a read-only
	//    query — WorkerMigrationStartupGate's IDatabaseMigrationReadiness check never writes —
	//    but a real connection to the shared local development database from a permanent
	//    regression test is exactly the defect Finding 3 already named once). The synthetic file
	//    placed in apps/api here carries the SAME safe closed-port POSTGRES_CONNECTION_STRING as
	//    BaseRequiredValues, so whichever side NoClobber makes win, no real network path exists.
	//
	// Verified against a real regression (see the commit message for the transcript): reverting
	// AppEnvironment.cs to bare Env.Load(path) lets this file's APP_ROLE="all" win over
	// `just build-api`'s own APP_ROLE=api export, resolving AppRole.All and registering
	// WorkerMigrationStartupGate INSIDE the real web host the real recipe builds to extract the
	// document — the same hosted-service graph that motivated #1019, now actually started by the
	// tool's own IHost.StartAsync(). That hosted service retries against the closed-port
	// connection string every 2 seconds (its RetryDelay) without ever completing, and the real
	// build hangs — exactly the "worker path blocking an otherwise DB-less tooling process"
	// failure #1019 exists to prevent. RunProcessWithTimeoutAsync's fixed timeout is what catches
	// that deterministically here instead of hanging the whole suite.
	[Fact]
	public async Task ItShouldResolveApiRoleDuringARealOpenApiDocumentGenerationRun() {
		var repoRootDirectory = FindRepoRootDirectory();
		var apiProjectDirectory = Path.Combine(repoRootDirectory, "apps", "api");
		var rspPath = Path.Combine(apiProjectDirectory, "MSBuild.rsp");
		var openApiFilesCachePath = Path.Combine(
			apiProjectDirectory, ".artifacts", "obj", "PublyApp.Api", "PublyApp.Api.OpenApiFiles.cache");

		// See point 3 above: apps/api must NEVER have its own .env.development in normal
		// operation. Refuse to run rather than silently overwrite an unexpected file.
		var syntheticDotEnvPath = Path.Combine(apiProjectDirectory, ".env.development");
		if (File.Exists(syntheticDotEnvPath)) {
			throw new InvalidOperationException(
				$"{syntheticDotEnvPath} already exists and this test refuses to overwrite it. " +
					"apps/api must never have its own .env.development — investigate before " +
					"rerunning (a previous crashed run of this exact test is the likely cause; " +
					"it is safe to delete this file once you've confirmed that).");
		}

		// Round-4 review: unlike the dotenv guard above, MSBuild.rsp had NO pre-existence
		// guard at all — a developer's own response file would simply be overwritten and then
		// deleted. Refuse to run rather than touch it, exactly like the dotenv guard above.
		if (File.Exists(rspPath)) {
			throw new InvalidOperationException(
				$"{rspPath} already exists and this test refuses to overwrite it. " +
					"apps/api must never have its own MSBuild.rsp in normal operation — " +
					"investigate before rerunning (a previous crashed run of this exact test is " +
					"the likely cause; it is safe to delete this file once you've confirmed that).");
		}

		var outputDirectory = Path.Combine(_tempDirectory, "docgen-out");
		Directory.CreateDirectory(outputDirectory);
		var redirectedCachePath = Path.Combine(
			outputDirectory, "PublyApp.Api.OpenApiFiles.cache");
		byte[]? originalCacheBytes = File.Exists(openApiFilesCachePath)
			? await File.ReadAllBytesAsync(openApiFilesCachePath)
			: null;
		var originalCacheLastWriteTimeUtc = originalCacheBytes is not null
			? File.GetLastWriteTimeUtc(openApiFilesCachePath)
			: (DateTime?)null;

		// Round-4 review: each destructive step below registers its own rollback IMMEDIATELY
		// after it succeeds and BEFORE the next destructive step runs, so a failure partway
		// through (verified by making apps/api/.env.development an unwriteable directory) only
		// ever unwinds what has actually happened so far — never leaves an earlier response-file
		// write stranded. Cleanups run in `finally`, most
		// recently registered first, covering the failure/timeout paths too.
		var cleanupActions = new List<Action>();
		try {
			// Redirect the generated document and incremental-build cache away from shared
			// repository paths — see points 1 and 2 above.
			var rspContent = string.Join(
				'\n',
				$"-p:OpenApiJsonFile={Path.Combine(outputDirectory, "openapi.json")}",
				$"-p:OpenApiDocumentsDirectory={outputDirectory}",
				$"-p:OpenApiGeneratedProjectFile={Path.Combine(outputDirectory, "PublyApp.Api.json")}",
				$"-p:_OpenApiDocumentsCache={redirectedCachePath}",
				"-p:GENERATE_OPENAPI=true");
			await File.WriteAllTextAsync(rspPath, rspContent);
			cleanupActions.Add(() => {
				if (File.Exists(rspPath)) {
					File.Delete(rspPath);
				}
			});

			// See point 3 above: APP_ROLE="all" is the discriminator #1019 protects; every
			// other value (including POSTGRES_CONNECTION_STRING) is the same
			// UnreachablePostgresConnectionString every other case in this file uses.
			var syntheticValues = new Dictionary<string, string>(BaseRequiredValues) {
				["APP_ROLE"] = "all",
			};
			var syntheticDotEnvContent = string.Join(
				'\n', syntheticValues.Select(pair => $"{pair.Key}=\"{pair.Value}\""));
			await File.WriteAllTextAsync(syntheticDotEnvPath, syntheticDotEnvContent);
			cleanupActions.Add(() => {
				if (File.Exists(syntheticDotEnvPath)) {
					File.Delete(syntheticDotEnvPath);
				}
			});

			var startInfo = new ProcessStartInfo {
				FileName = "just",
				WorkingDirectory = repoRootDirectory,
				RedirectStandardOutput = true,
				RedirectStandardError = true,
				UseShellExecute = false,
			};
			startInfo.ArgumentList.Add("build-api");
			// Deliberately NOT passing an explicit role: the whole point of this case is to let
			// `just build-api`'s OWN default parameter (justfile:101, currently $APP_ROLE="api")
			// flow through unmodified — a mutation of that default is exactly what this case must
			// observe.

			startInfo.Environment.Remove("ASPNETCORE_ENVIRONMENT");
			startInfo.Environment.Remove("DOTNET_ENVIRONMENT");
			// Required for the unset-host-environment (Production) classification's validator;
			// not the pin under test.
			startInfo.Environment["TRUSTED_PROXY_CIDRS"] = "127.0.0.1/32,::1/128";
			// Round-4 review: this is the safety-critical line. ProcessStartInfo.Environment
			// inherits a copy of THIS test process's own environment, which already has
			// POSTGRES_CONNECTION_STRING set (TestEnvironment.cs's module-initializer
			// placeholder, "Host=localhost" with no port — Npgsql's default 5432). Only
			// removing ASPNETCORE_ENVIRONMENT/DOTNET_ENVIRONMENT above left that inherited
			// value in place, and under CORRECT (non-regressed) NoClobber(), an already-set
			// process value beats the file — so the real worker, when it started on the
			// deliberately-regressed recipe mutation, dialed the INHERITED placeholder, not
			// the synthetic file's value; see the class doc comment's round-4 section. Setting
			// it explicitly here to the SAME UnreachablePostgresConnectionString the synthetic
			// file also carries makes both sides of NoClobber() identically safe: whichever
			// value wins, it is this one — never the test host's own inherited placeholder.
			startInfo.Environment["POSTGRES_CONNECTION_STRING"] = UnreachablePostgresConnectionString;

			var result = await RunProcessWithTimeoutAsync(startInfo, TimeSpan.FromSeconds(120));

			result.ExitCode.Should().Be(
				0,
				"`just build-api`'s OWN APP_ROLE=\"api\" default (justfile:101) must win over " +
					"the file's APP_ROLE (#1019) for the REAL recipe to succeed — a nonzero exit " +
					"or timeout here means the file clobbered the pin (or the recipe's default " +
					"itself regressed) and the real build either failed validation or hung " +
					$"inside the worker hosted-service graph; stdout: {result.Stdout} " +
					$"stderr: {result.Stderr}");

			var generatedDocumentPath = Path.Combine(outputDirectory, "openapi.json");
			File.Exists(generatedDocumentPath).Should().BeTrue(
				"`just build-api` must have actually regenerated the OpenAPI document " +
					$"(redirected away from the checked-in apps/api/openapi.json) at " +
					$"{generatedDocumentPath}; stdout: {result.Stdout} stderr: {result.Stderr}");

			var generatedDocument = await File.ReadAllTextAsync(generatedDocumentPath);
			generatedDocument.Should().Contain(
				"/auth/login",
				"a real anonymous route must appear in the document `just build-api` generated, " +
					"proving the web host (Api/All role) actually ran and served the document " +
					"request — the Worker role's blocking Generic Host never reaches this code " +
					"path at all");
		} finally {
			for (var i = cleanupActions.Count - 1; i >= 0; i--) {
				try {
					cleanupActions[i]();
				} catch (IOException) {
					// Best-effort: one cleanup step failing (e.g. a transient file lock) must
					// not prevent the OTHER already-registered cleanups from still running.
				} catch (UnauthorizedAccessException) {
					// Same rationale as above.
				}
			}
		}

		if (originalCacheBytes is null) {
			File.Exists(openApiFilesCachePath).Should().BeFalse(
				"the run must leave an originally absent shared OpenAPI cache absent");
		} else {
			File.Exists(openApiFilesCachePath).Should().BeTrue(
				"the run must leave the pre-existing shared OpenAPI cache in place");
			var currentCacheBytes = await File.ReadAllBytesAsync(openApiFilesCachePath);
			currentCacheBytes.Should().Equal(
				originalCacheBytes,
				"the run must not change the shared OpenAPI cache's bytes");
			File.GetLastWriteTimeUtc(openApiFilesCachePath).Should().Be(
				originalCacheLastWriteTimeUtc,
				"the run must not change the shared OpenAPI cache's timestamp");
		}
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

	// Walks up from the running test assembly's own directory (which lives under
	// apps/api/.artifacts/bin/PublyApp.Api.Tests/..., since apps/api/Directory.Build.props pins
	// DotNetArtifactsRoot for every project under apps/api to a shared apps/api/.artifacts/)
	// until it finds the repo-root `justfile` — the file `just build-api` (justfile:101) is
	// defined in, and the directory `just` resolves its `api_dir` variable relative to.
	private static string FindRepoRootDirectory() {
		var assemblyDirectory = Path.GetDirectoryName(typeof(Program).Assembly.Location);
		if (assemblyDirectory is null) {
			throw new InvalidOperationException("Could not determine the test assembly's directory.");
		}

		var directory = new DirectoryInfo(assemblyDirectory);
		while (directory is not null) {
			if (File.Exists(Path.Combine(directory.FullName, "justfile"))) {
				return directory.FullName;
			}

			directory = directory.Parent;
		}

		throw new InvalidOperationException(
			"Could not locate the repo root (containing justfile) by walking up from " +
				$"{assemblyDirectory}.");
	}

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
