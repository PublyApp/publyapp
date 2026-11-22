using System.ComponentModel;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;

using Npgsql;

namespace PublyApp.Api.Lib.Testing.Fixtures;

/// <summary>Runs one docker CLI command and returns its exit code and streams.</summary>
internal delegate Task<(int ExitCode, string Stdout, string Stderr)> DockerRunner(
	IReadOnlyList<string> arguments,
	CancellationToken ct
);

/// <summary>
/// Opt-in reuse of one long-lived Postgres container across local test runs.
///
/// Enabled by <c>PUBLYAPP_TEST_REUSE_DB=1</c> outside CI (the <c>just</c>
/// recipes set it). CI keeps the throwaway Testcontainers container: reuse is
/// disabled whenever <c>CI</c>/<c>GITHUB_ACTIONS</c> is set, so a fresh runner
/// behaves exactly as before.
///
/// The container is named after the repository path, so several worktrees can
/// each keep their own warm database, and is labelled so
/// <c>just test-db-down</c> removes only containers this fixture created.
/// </summary>
internal static class TestDatabaseReuse {
	public const string EnableVariable = "PUBLYAPP_TEST_REUSE_DB";
	public const string ContainerLabel = "publyapp.test-db";

	private const string _Image = "postgres:18-alpine";
	// The first `docker run` of the image runs initdb inside the container; on a
	// loaded laptop that can take minutes, so the deadline is generous.
	private static readonly TimeSpan _ReadyTimeout = TimeSpan.FromSeconds(300);
	private static readonly TimeSpan _ReadyPollInterval = TimeSpan.FromMilliseconds(250);
	// A losing `docker run` must wait for the winner's container to become
	// visible; `docker run` returning is not a guarantee that `docker inspect`
	// can already see it.
	private static readonly TimeSpan _ContainerAppearTimeout =
		TimeSpan.FromSeconds(30);
	private static readonly TimeSpan _ContainerPollInterval =
		TimeSpan.FromMilliseconds(100);
	// No docker CLI call may hang the test process forever (daemon stall,
	// image pull, name removal in progress).
	private static readonly TimeSpan _DockerTimeout = TimeSpan.FromSeconds(300);
	private static readonly Lazy<string> _RepoRoot = new(TestDatabaseReuse._FindRepoRoot);
	private static readonly Lazy<string> _ContainerName = new(TestDatabaseReuse._BuildContainerName);

	public static bool IsEnabled {
		get {
			return Environment.GetEnvironmentVariable(TestDatabaseReuse.EnableVariable) == "1"
				&& !TestDatabaseReuse._IsContinuousIntegration();
		}
	}

	public static string RepoRoot {
		get { return TestDatabaseReuse._RepoRoot.Value; }
	}

	public static string ContainerName {
		get { return TestDatabaseReuse._ContainerName.Value; }
	}

	/// <summary>
	/// Starts (or resumes) the reusable container and returns an admin
	/// connection string once Postgres accepts connections.
	/// </summary>
	public static async Task<string> StartAsync(CancellationToken ct = default) {
		var name = TestDatabaseReuse.ContainerName;
		await TestDatabaseReuse.EnsureContainerAsync(name, ct);

		var port = await TestDatabaseReuse._ReadPortAsync(name, ct);
		var connectionString =
			TestDatabaseReuse.BuildAdminConnectionString(port);
		await TestDatabaseReuse._WaitUntilReadyAsync(
			TestDatabaseReuse.BuildProbeConnectionString(connectionString),
			ct
		);
		Console.Error.WriteLine(
			$"[test-db] reusable Postgres container '{name}' ready on 127.0.0.1:{port}"
		);
		return connectionString;
	}

	// The admin string keeps Npgsql's normal connect timeout (15 s): it is
	// copied into every per-test database string and into the app's UseNpgsql,
	// so a 2 s timeout there would turn a slow connect into a flaky red that
	// looks like a test bug.
	internal static string BuildAdminConnectionString(int port) {
		return "Host=127.0.0.1;"
			+ $"Port={port};"
			+ "Database=postgres;"
			+ "Username=postgres;"
			+ "Password=postgres;"
			+ "Pooling=false;"
			+ "Timeout=15";
	}

	// Only the readiness probe needs to fail fast: it polls until Postgres
	// accepts connections and a 2 s attempt keeps that loop responsive.
	internal static string BuildProbeConnectionString(
		string adminConnectionString
	) {
		return new NpgsqlConnectionStringBuilder(adminConnectionString) {
			Timeout = 2
		}.ConnectionString;
	}

	internal static async Task EnsureContainerAsync(
		string name,
		CancellationToken ct = default,
		DockerRunner? runner = null,
		TimeSpan? containerAppearTimeout = null
	) {
		runner ??= TestDatabaseReuse._DockerAsync;
		var inspectFormat = TestDatabaseReuse._InspectFormat;
		var status = await runner(
			["inspect", "--format", inspectFormat, name],
			ct
		);
		if (status.ExitCode == 0) {
			await TestDatabaseReuse._ResumeAsync(name, status.Stdout, ct, runner);
			return;
		}

		var created = await runner(
			[
				"run", "-d",
				"--name", name,
				"--label", $"{TestDatabaseReuse.ContainerLabel}=1",
				"-e", "POSTGRES_USER=postgres",
				"-e", "POSTGRES_PASSWORD=postgres",
				"-e", "POSTGRES_DB=postgres",
				"-p", "127.0.0.1::5432",
				TestDatabaseReuse._Image,
				// Local, disposable data: skip per-commit fsync so a
				// checkpoint (triggered by DROP DATABASE) cannot stall on a
				// busy laptop disk. CI keeps the Testcontainers defaults.
				"-c", "fsync=off",
				"-c", "synchronous_commit=off",
				"-c", "full_page_writes=off",
				"-c", "max_wal_size=2GB",
			],
			ct
		);
		if (created.ExitCode == 0) {
			return;
		}

		// Only a name conflict means another process won the race; any other
		// failure (daemon down, missing image, bad args) must fail now.
		if (
			!created.Stderr.Contains(
				"already in use",
				StringComparison.OrdinalIgnoreCase
			)
		) {
			TestDatabaseReuse._EnsureSuccess(created, "run", name);
		}

		await TestDatabaseReuse._WaitForRacedContainerAsync(
			name,
			created,
			containerAppearTimeout ?? TestDatabaseReuse._ContainerAppearTimeout,
			runner,
			ct
		);
	}

	private const string _InspectFormat =
		"{{.State.Running}}"
		+ "|{{index .Config.Labels \"publyapp.test-db\"}}";

	private static async Task _WaitForRacedContainerAsync(
		string name,
		(int ExitCode, string Stdout, string Stderr) created,
		TimeSpan timeout,
		DockerRunner runner,
		CancellationToken ct
	) {
		// `docker run` can return the conflict before the winner's container is
		// inspectable, so retry until it appears instead of failing the run.
		var deadline = DateTime.UtcNow + timeout;
		while (true) {
			var raced = await runner(
				["inspect", "--format", TestDatabaseReuse._InspectFormat, name],
				ct
			);
			if (raced.ExitCode == 0) {
				await TestDatabaseReuse._ResumeAsync(
					name,
					raced.Stdout,
					ct,
					runner
				);
				return;
			}

			if (DateTime.UtcNow >= deadline) {
				// Report the original conflict, not the last inspect error.
				TestDatabaseReuse._EnsureSuccess(created, "run", name);
			}

			await Task.Delay(
				TestDatabaseReuse._ContainerPollInterval,
				ct
			);
		}
	}

	private static async Task _ResumeAsync(
		string name,
		string inspectOutput,
		CancellationToken ct,
		DockerRunner runner
	) {
		var parts = inspectOutput.Trim().Split('|', 2);
		var isRunning = parts[0] == "true";
		if (parts.Length < 2 || parts[1].Trim() != "1") {
			throw new InvalidOperationException(
				$"Docker container '{name}' already exists but was not "
				+ "created by the test fixtures. Remove it, or set "
				+ $"{TestDatabaseReuse.EnableVariable}=0 to use Testcontainers."
			);
		}

		if (isRunning) {
			return;
		}

		var started = await runner(["start", name], ct);
		TestDatabaseReuse._EnsureSuccess(started, "start", name);
	}

	private static async Task<int> _ReadPortAsync(
		string name,
		CancellationToken ct
	) {
		var result = await TestDatabaseReuse._DockerAsync(
			["port", name, "5432/tcp"],
			ct
		);
		TestDatabaseReuse._EnsureSuccess(result, "port", name);
		var value = result.Stdout.Trim();
		var separator = value.LastIndexOf(':');
		if (
			separator < 0
			|| !int.TryParse(value[(separator + 1)..], out var port)
		) {
			throw new InvalidOperationException(
				$"Could not read the host port of test container '{name}' "
				+ $"from docker output '{value}'."
			);
		}

		return port;
	}

	private static async Task _WaitUntilReadyAsync(
		string connectionString,
		CancellationToken ct
	) {
		var deadline = DateTime.UtcNow + TestDatabaseReuse._ReadyTimeout;
		Exception? lastError = null;
		while (DateTime.UtcNow < deadline) {
			try {
				await using var connection =
					new NpgsqlConnection(connectionString);
				await connection.OpenAsync(ct);
				await using var command = new NpgsqlCommand(
					"SELECT 1",
					connection
				);
				_ = await command.ExecuteScalarAsync(ct);
				return;
			} catch (Exception ex) when (
				ex is NpgsqlException or TimeoutException
			) {
				lastError = ex;
				await Task.Delay(TestDatabaseReuse._ReadyPollInterval, ct);
			}
		}

		throw new InvalidOperationException(
			"The reusable Postgres container did not accept connections "
			+ $"within {TestDatabaseReuse._ReadyTimeout.TotalSeconds:0}s. "
			+ $"Remove it with `just test-db-down`, or set "
			+ $"{TestDatabaseReuse.EnableVariable}=0.",
			lastError
		);
	}

	private static async Task<(int ExitCode, string Stdout, string Stderr)>
		_DockerAsync(
			IReadOnlyList<string> arguments,
			CancellationToken ct
		) {
		var startInfo = new ProcessStartInfo("docker") {
			RedirectStandardOutput = true,
			RedirectStandardError = true,
			UseShellExecute = false,
		};
		foreach (var argument in arguments) {
			startInfo.ArgumentList.Add(argument);
		}

		Process process;
		try {
			var started = Process.Start(startInfo);
			if (started is null) {
				throw new InvalidOperationException(
					"The docker CLI returned no process."
				);
			}

			process = started;
		} catch (Exception ex) when (
			ex is Win32Exception or InvalidOperationException
		) {
			throw new InvalidOperationException(
				"Could not run the docker CLI. Is Docker installed and on "
				+ $"PATH? Set {TestDatabaseReuse.EnableVariable}=0 to use "
				+ "Testcontainers instead.",
				ex
			);
		}

		using (process) {
			var stdoutTask = process.StandardOutput.ReadToEndAsync(ct);
			var stderrTask = process.StandardError.ReadToEndAsync(ct);
			using var deadline =
				CancellationTokenSource.CreateLinkedTokenSource(ct);
			deadline.CancelAfter(TestDatabaseReuse._DockerTimeout);
			try {
				await process.WaitForExitAsync(deadline.Token);
			} catch (OperationCanceledException) when (
				!ct.IsCancellationRequested
			) {
				try {
					process.Kill(entireProcessTree: true);
				} catch (InvalidOperationException) {
					// Already exited between the timeout and the kill.
				}

				throw new InvalidOperationException(
					$"docker {string.Join(' ', arguments)} did not finish within "
					+ $"{TestDatabaseReuse._DockerTimeout.TotalSeconds:0}s. "
					+ "Check that the Docker daemon is responsive, or set "
					+ $"{TestDatabaseReuse.EnableVariable}=0."
				);
			}

			return (process.ExitCode, await stdoutTask, await stderrTask);
		}
	}

	private static void _EnsureSuccess(
		(int ExitCode, string Stdout, string Stderr) result,
		string verb,
		string name
	) {
		if (result.ExitCode == 0) {
			return;
		}

		throw new InvalidOperationException(
			$"docker {verb} '{name}' failed: {result.Stderr.Trim()}"
		);
	}

	private static bool _IsContinuousIntegration() {
		var ci = Environment.GetEnvironmentVariable("CI");
		var githubActions = Environment.GetEnvironmentVariable("GITHUB_ACTIONS");
		return string.Equals(ci, "true", StringComparison.OrdinalIgnoreCase)
			|| ci == "1"
			|| string.Equals(
				githubActions,
				"true",
				StringComparison.OrdinalIgnoreCase
			);
	}

	private static string _FindRepoRoot() {
		var directory = new DirectoryInfo(AppContext.BaseDirectory);
		while (directory is not null) {
			if (
				File.Exists(
					Path.Combine(
						directory.FullName,
						"apps",
						"api",
						"PublyApp.Api.csproj"
					)
				)
			) {
				return directory.FullName;
			}

			directory = directory.Parent;
		}

		throw new InvalidOperationException(
			"Could not find the repository root from the test output "
			+ $"directory '{AppContext.BaseDirectory}'."
		);
	}

	private static string _BuildContainerName() {
		var hash = Convert.ToHexString(
			SHA256.HashData(
				Encoding.UTF8.GetBytes(TestDatabaseReuse.RepoRoot)
			)
		)[..8].ToLowerInvariant();
		return $"publyapp-test-db-{hash}";
	}
}
