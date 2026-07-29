using System.Diagnostics;

using FluentAssertions;

using PublyApp.Api.Lib.Diagnostics;

using Xunit;

namespace PublyApp.Api.Lib;

/// <summary>
/// Pins #1019: <c>DotNetEnv.LoadOptions.NoClobber()</c> (AppEnvironment.cs,
/// <c>LoadDotEnvIfDevelopment</c>) must make an explicit process environment variable win
/// over the checked-in <c>.env.development</c> file's value for it, while a variable the
/// process never sets must still fall back to the file. This is the repository-wide
/// precedence contract every Development/unset-host-environment process relies on
/// (<c>dev-api</c>, <c>build-api</c>/EF tooling, bulk-seed, and #1016's review-api
/// launcher) — not just APP_ROLE, but APP_ROLE is what the composed hosted-service graph
/// makes directly observable.
///
/// Runs the REAL api assembly out-of-process via the <c>--print-hosted-services</c> probe
/// (<see cref="HostedServiceManifestCli"/>) against a synthetic, throwaway
/// <c>.env.development</c> in an isolated temp directory — never the repo's own file — so
/// the assertion is about the RESOLVED application role (which hosted services actually get
/// registered), not merely the third-party DotNetEnv API surface. No Docker involved:
/// POSTGRES_CONNECTION_STRING only needs to be well-formed
/// (<c>BeValidPostgresConnectionString</c> parses it with <c>NpgsqlConnectionStringBuilder</c>
/// and never connects), and the probe never calls <c>IHostedService.StartAsync</c>.
/// </summary>
public sealed class AppEnvironmentDotEnvPrecedenceSpec : IDisposable {
	// Registered only for the Worker/All roles (JobsServiceRegistration.AddWorkerServices) —
	// its presence/absence in the resolved hosted-service manifest is the observable proof
	// of which APP_ROLE actually won.
	private const string WorkerOnlyHostedServiceTypeName =
		"PublyApp.Api.Infrastructure.Jobs.WorkerMigrationStartupGate";

	private readonly string _tempDirectory;

	// A minimal, well-formed .env.development: every AppEnvironment-required variable
	// present with a validator-passing placeholder (mirrors .env.example), and
	// APP_ROLE="all" — the value under test for file-fallback vs. process-override.
	private const string SyntheticEnvContent = """
		APP_NAME="PublyApp"
		FRONT_URL="http://localhost:5050"
		POSTGRES_CONNECTION_STRING="Host=localhost;Port=5454;Database=publyapp_precedence_test;Username=postgres;Password=not-a-real-password"
		RESEND_API_KEY="not-a-real-key"
		DEFAULT_EMAIL_SENDER_NAME="PublyApp Support"
		DEFAULT_EMAIL_SENDER_EMAIL="no-reply@example.com"
		STAFF_OWNER_EMAIL="owner@example.com"
		STAFF_OWNER_BOOTSTRAP_CODE="not-a-real-code"
		SESSION_TOKEN_HEADER_KEY="X-Session-Token"
		TENANT_ID_HEADER_KEY="X-PublyApp-TenantId"
		SESSION_EXPIRY_DAYS="7"
		PASSWORD_MIN_LENGTH="12"
		EMAIL_VERIFY_TOKEN_LENGTH="25"
		EMAIL_VERIFY_TOKEN_VALIDITY_DURATION="7"
		PASSWORD_RESET_TOKEN_LENGTH="25"
		PASSWORD_RESET_TOKEN_VALIDITY_DURATION="7"
		INVITATION_TOKEN_LENGTH="32"
		APP_ROLE="all"
		""";

	public AppEnvironmentDotEnvPrecedenceSpec() {
		_tempDirectory = Directory.CreateTempSubdirectory("publyapp-dotenv-precedence-").FullName;
		File.WriteAllText(Path.Combine(_tempDirectory, ".env.development"), SyntheticEnvContent);
	}

	public void Dispose() {
		Directory.Delete(_tempDirectory, recursive: true);
	}

	[Fact]
	public void ItShouldResolveApiRoleWhenTheProcessExplicitlySetsAppRoleOverTheFilesAll() {
		var resolved = RunHostedServiceManifestProbe(processAppRole: "api");

		resolved.Should().NotBeEmpty(
			"the api role starts at least the web host service, so a clean probe is non-empty");
		resolved.Should().NotContain(
			WorkerOnlyHostedServiceTypeName,
			"an explicit process APP_ROLE=api must win over .env.development's APP_ROLE=\"all\" " +
				"(#1019) — if the file clobbered it, the worker gate would be registered");
	}

	[Fact]
	public void ItShouldFallBackToTheFilesAppRoleWhenTheProcessNeverSetsIt() {
		var resolved = RunHostedServiceManifestProbe(processAppRole: null);

		resolved.Should().NotBeEmpty(
			"the all role starts at least the web host service, so a clean probe is non-empty");
		resolved.Should().Contain(
			WorkerOnlyHostedServiceTypeName,
			"omitting the process value entirely must still fall back to .env.development's " +
				"APP_ROLE=\"all\" (#1019's other direction) — this proves the fix is a NoClobber " +
				"override, not an accidental \"process always wins and the file is never read\" change");
	}

	// Testing/Staging/Production must never reach LoadDotEnvIfDevelopment's DotNetEnv.Env.Load
	// call at all — confirmed here by observation, not by reading the early-return. The
	// synthetic .env.development in _tempDirectory supplies every required variable
	// (including POSTGRES_CONNECTION_STRING); the process supplies NONE of them. If the file
	// were consulted, Initialize() would succeed. If it is genuinely skipped, the very first
	// GetRequiredString call (POSTGRES_CONNECTION_STRING) throws before Program.Main ever
	// reaches the --print-hosted-services dispatch, so the process exits non-zero and the
	// exception naming that variable appears on stderr.
	[Theory]
	[InlineData("Testing")]
	[InlineData("Staging")]
	[InlineData("Production")]
	public void ItShouldNeverConsultTheFileForNonDevelopmentHostEnvironments(string hostEnvironment) {
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

		startInfo.Environment["ASPNETCORE_ENVIRONMENT"] = hostEnvironment;
		startInfo.Environment.Remove("DOTNET_ENVIRONMENT");
		// Deliberately supply NONE of the required AppEnvironment variables via the process —
		// only the synthetic file in _tempDirectory has them. Also strip anything the outer
		// test-runner process happens to carry (e.g. a Testcontainers connection string),
		// which would otherwise mask the very condition under test.
		foreach (var requiredVariableName in RequiredVariableNames) {
			startInfo.Environment.Remove(requiredVariableName);
		}

		using var process = Process.Start(startInfo);
		if (process is null) {
			throw new InvalidOperationException(
				"Failed to launch the api assembly for the dotenv-precedence probe.");
		}

		var stdout = process.StandardOutput.ReadToEnd();
		var stderr = process.StandardError.ReadToEnd();
		process.WaitForExit(milliseconds: 30_000).Should().BeTrue(
			"the process must fail fast, not hang; stdout: " + stdout + " stderr: " + stderr);

		process.ExitCode.Should().NotBe(
			HostedServiceManifestCli.SuccessExitCode,
			$"{hostEnvironment} must never load .env.development, so the required " +
				"POSTGRES_CONNECTION_STRING the synthetic file supplies must be reported missing " +
				$"instead of resolving; stdout: {stdout} stderr: {stderr}");
		stderr.Should().Contain(
			"POSTGRES_CONNECTION_STRING",
			"the failure must specifically be the first required variable the synthetic file " +
				"would have supplied — proving the file was never read, not merely that SOME " +
				"unrelated startup error occurred");
		stdout.Should().NotContain(
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

	// Spawns the shipped api assembly as an isolated child process with its working
	// directory pinned to the synthetic temp directory, so FindDotEnvPath's parent-walk
	// can only ever discover OUR throwaway file — never the repo's real one.
	private List<string> RunHostedServiceManifestProbe(string? processAppRole) {
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

		// ASPNETCORE_ENVIRONMENT=Development, exactly like `dotnet watch run` under
		// launchSettings.json — the real path #1019 protects (dev-api and #1016's
		// review-api launcher both hit this exact line). DOTNET_ENVIRONMENT is cleared so
		// it cannot shadow it.
		startInfo.Environment["ASPNETCORE_ENVIRONMENT"] = "Development";
		startInfo.Environment.Remove("DOTNET_ENVIRONMENT");
		if (processAppRole is null) {
			startInfo.Environment.Remove("APP_ROLE");
		} else {
			startInfo.Environment["APP_ROLE"] = processAppRole;
		}

		using var process = Process.Start(startInfo);
		if (process is null) {
			throw new InvalidOperationException(
				"Failed to launch the api assembly for the dotenv-precedence probe.");
		}

		var stdout = process.StandardOutput.ReadToEnd();
		var stderr = process.StandardError.ReadToEnd();
		process.WaitForExit(milliseconds: 30_000).Should().BeTrue(
			"the composition probe must finish promptly; stderr: " + stderr);

		process.ExitCode.Should().Be(
			HostedServiceManifestCli.SuccessExitCode,
			"the probe composes and exits cleanly; stdout: " + stdout + " stderr: " + stderr);

		stdout.Should().Contain(HostedServiceManifestCli.EndMarker);

		return stdout
			.Split('\n')
			.Select(line => line.Trim())
			.Where(line => line.StartsWith(HostedServiceManifestCli.LinePrefix, StringComparison.Ordinal))
			.Select(line => line[HostedServiceManifestCli.LinePrefix.Length..])
			.ToList();
	}
}
