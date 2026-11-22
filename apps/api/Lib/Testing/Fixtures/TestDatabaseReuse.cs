using System.ComponentModel;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;

using Npgsql;

namespace PublyApp.Api.Lib.Testing.Fixtures;
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
		await TestDatabaseReuse._EnsureContainerAsync(name, ct);

		var port = await TestDatabaseReuse._ReadPortAsync(name, ct);
		var connectionString =
			"Host=127.0.0.1;"
			+ $"Port={port};"
			+ "Database=postgres;"
			+ "Username=postgres;"
			+ "Password=postgres;"
			+ "Pooling=false;"
			+ "Timeout=2";
		await TestDatabaseReuse._WaitUntilReadyAsync(connectionString, ct);
		Console.Error.WriteLine(
			$"[test-db] reusable Postgres container '{name}' ready on 127.0.0.1:{port}"
		);
		return connectionString;
	}

	private static async Task _EnsureContainerAsync(
		string name,
		CancellationToken ct
	) {
		var inspectFormat =
			"{{.State.Running}}"
			+ "|{{index .Config.Labels \"publyapp.test-db\"}}";
		var status = await TestDatabaseReuse._DockerAsync(
			["inspect", "--format", inspectFormat, name],
			ct
		);
		if (status.ExitCode == 0) {
			await TestDatabaseReuse._ResumeAsync(name, status.Stdout, ct);
			return;
		}

		var created = await TestDatabaseReuse._DockerAsync(
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

		// Another test process may have won the race to create it.
		var raced = await TestDatabaseReuse._DockerAsync(
			["inspect", "--format", inspectFormat, name],
			ct
		);
		if (raced.ExitCode != 0) {
			TestDatabaseReuse._EnsureSuccess(created, "run", name);
			return;
		}

		await TestDatabaseReuse._ResumeAsync(name, raced.Stdout, ct);
	}

	private static async Task _ResumeAsync(
		string name,
		string inspectOutput,
		CancellationToken ct
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

		var started = await TestDatabaseReuse._DockerAsync(["start", name], ct);
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
			await process.WaitForExitAsync(ct);
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
