using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;

using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// Source guard for the Aspire AppHost's central claims (issue #1722 / PR #1840).
///
/// The AppHost (apps/apphost/Program.cs) is a top-level-statements project that this
/// test project cannot reference — an AppHost referencing the API is one direction
/// only — so the guard reads its source directly, the same way
/// <see cref="CanaryProbeContainmentSpec"/> reads deploy manifests. It spawns the
/// AppHost only for the one claim that source text cannot prove: that an occupied
/// port 5454 fails loudly.
///
/// Mutation matrix (round-3 reviewer, all four red):
///   remove .WithDataVolume()            -> ItShouldPersistPostgresDataInANamedVolume
///   remove .WithHostPort(5454)           -> ItShouldPinThePostgresHostPortTo5454
///   drop launchProfileName: null         -> ItShouldKeepTheWorkerOffTheApiPort
///   drop the port-5454 pre-flight guard  -> ItShouldGuardTheOccupiedPort5454CaseLoudly
///                                           + ItShouldFailLoudlyWhenHostPort5454IsAlreadyOccupied
///                                           (without the guard, DCP logs 'address
///                                           already in use' only in its internal
///                                           per-resource logs, the AppHost keeps
///                                           running on an ephemeral port, and the
///                                           console never names the cause — so both
///                                           the source-token and the behavioral test
///                                           go red)
/// </summary>
public sealed partial class AppHostOrchestrationGuardSpec : IDisposable {
	// The one file this guard reads. Kept as a constant so a rename of the AppHost
	// entrypoint fails the guard loudly (file missing) instead of silently
	// narrowing the scan.
	private const string AppHostProgramRelativePath = "apps/apphost/Program.cs";

	private const int HostPort = 5454;

	private TcpListener? _occupier;

	public void Dispose() {
		_occupier?.Dispose();
		_occupier = null;
	}

	[Fact]
	public void ItShouldPersistPostgresDataInANamedVolume() {
		var program = ReadAppHostProgram();

		program.Should().Contain(
			".WithDataVolume()",
			"round-3 mutation: removing .WithDataVolume() from the postgres resource "
				+ "made the data directory disposable — every AppHost restart wiped the "
				+ "local database. No other test in the suite touches this claim "
				+ "(grep WithDataVolume matches only apps/apphost/Program.cs)."
		);
	}

	[Fact]
	public void ItShouldPinThePostgresHostPortTo5454() {
		var program = ReadAppHostProgram();

		program.Should().Contain(
			".WithHostPort(5454)",
			"round-3 mutation: removing .WithHostPort(5454) put the postgres container "
				+ "back on a random ephemeral port, so the documented "
				+ "Host=localhost;Port=5454 connection string would hit whatever else "
				+ "listens there. The port is part of the local development contract."
		);
	}

	[Fact]
	public void ItShouldKeepTheWorkerOffTheApiPort() {
		var program = ReadAppHostProgram();

		WorkerLaunchProfileNull().IsMatch(program).Should().BeTrue(
			"round-3 mutation: dropping 'launchProfileName: null' from the worker's "
				+ "AddProject call made the worker inherit the 'http' launch profile "
				+ "and try to bind the API's port 5000, which the DCP proxy fails on "
				+ "with 'address already in use'."
		);
	}

	[Fact]
	public void ItShouldGuardTheOccupiedPort5454CaseLoudly() {
		var program = ReadAppHostProgram();

		PortGuardMessage().IsMatch(program).Should().BeTrue(
			"the AppHost must pre-flight host port 5454 and fail loudly — naming the "
				+ "port, the 'address already in use' cause, and the next action — "
					+ "before it starts anything. A silent fallback to an ephemeral "
					+ "port while POSTGRES_CONNECTION_STRING still announces 5454 is "
					+ "exactly the data-integrity hazard round-3 observed live (the "
					+ "worker writing into another worktree's database)."
		);
	}

	[Fact]
	public async Task ItShouldFailLoudlyWhenHostPort5454IsAlreadyOccupied() {
		// Behavioral half of B1: the source-token guard above proves the code is
		// there; this test proves it FIRES. Run the real AppHost against an
		// occupied 5454 and require a loud, self-caused failure.
		//
		// Occupancy: bind 127.0.0.1:5454 in-process — exactly the address DCP's
		// postgres proxy binds (its own error says 'listen tcp 127.0.0.1:5454:
		// bind: address already in use'). No docker dependency, works on CI
		// runners. If the port is already occupied on a dev machine (the normal
		// case: a leftover local dev Postgres), the bind fails and we use the
		// existing occupier — the AppHost must fail the same way for ANY
		// occupier, so the test stays valid.
		try {
			var listener = new TcpListener(IPAddress.Loopback, HostPort);
			listener.Start();
			_occupier = listener;
		} catch (SocketException) {
			// 5454 already occupied by a real process — equally valid evidence.
		}

		var repoRoot = FindRepoRoot();
		var run = await RunAppHostAsync(
			repoRoot,
			TimeSpan.FromMinutes(10),
			// Same pin as the justfile dev-services recipe: the implicit build
			// must not run OpenAPI document generation, which boots the app with
			// the ambient .env.development (APP_ROLE=all) while no Postgres is
			// up yet. This test exercises the port pre-flight, not doc-gen.
			["run", "--project", "apps/apphost", "--property:OpenApiGenerateDocuments=false"]
		);

		run.ExitedOnItsOwn.Should().BeTrue(
			"with 5454 occupied the AppHost must fail on its own, fast — not run "
				+ "until the timeout kills it"
		);
		run.ExitCode.Should().Be(
			1,
			$"a non-zero exit is the loud half; actual exit code {run.ExitCode}"
		);
		var tailStart = Math.Max(0, run.Console.Length - 800);
		PortGuardMessage().IsMatch(run.Console).Should().BeTrue(
			"the console must name the cause in plain words: port 5454 is already "
				+ "in use and what to do about it. The bare DCP "
				+ "'address already in use' proxy log is internal to DCP and never "
				+ "reaches the console — that silence is the round-3 finding. "
				+ $"Console tail: …{run.Console[tailStart..]}"
		);
	}

	private static string ReadAppHostProgram() {
		var repoRoot = FindRepoRoot();
		var path = Path.Combine(repoRoot, AppHostProgramRelativePath);

		File.Exists(path).Should().BeTrue(
			"the AppHost entrypoint moved or was renamed — reconcile the guard "
				+ "path, do not let the scan silently narrow"
		);

		return File.ReadAllText(path);
	}

	private static async Task<AppHostRun> RunAppHostAsync(
		string repoRoot,
		TimeSpan budget,
		string[] dotnetArguments
	) {
		using var cts = new CancellationTokenSource(budget);
		var console = new StringBuilder();
		var process = new Process {
			StartInfo = {
				FileName = "dotnet",
				WorkingDirectory = repoRoot,
				UseShellExecute = false,
				RedirectStandardOutput = true,
				RedirectStandardError = true,
			}
		};
		foreach (var argument in dotnetArguments) {
			process.StartInfo.ArgumentList.Add(argument);
		}

		void AppendOutput(object? sender, DataReceivedEventArgs args) {
			if (args.Data is not null) {
				lock (console) {
					console.AppendLine(args.Data);
				}
			}
		}

		process.OutputDataReceived += AppendOutput;
		process.ErrorDataReceived += AppendOutput;
		process.Start().Should().BeTrue("dotnet must be available to run the AppHost");
		process.BeginOutputReadLine();
		process.BeginErrorReadLine();

		var startedAt = DateTime.UtcNow;
		// dotnet run does NOT forward the token: poll for the budget instead so
		// the kill is explicit and the test can distinguish "exited on its own"
		// from "the budget killed it".
		using var timer = new PeriodicTimer(TimeSpan.FromSeconds(5));
		var exitedOnItsOwn = false;
		try {
			while (await timer.WaitForNextTickAsync(cts.Token)) {
				if (process.HasExited) {
					exitedOnItsOwn = true;
					break;
				}
			}
		} catch (OperationCanceledException) {
			// Budget exhausted — fall through and kill below.
		}

		try {
			if (!exitedOnItsOwn) {
				process.Kill(entireProcessTree: true);
			}

			// Drain whatever the process emitted on its way out.
			await process.WaitForExitAsync(CancellationToken.None);
		} catch (Exception) {
			// Kill races (process already gone) are fine; the assertions below
			// report the real outcome either way.
		}

		string consoleText;
		lock (console) {
			consoleText = console.ToString();
		}

		return new AppHostRun(
			process.ExitCode,
			consoleText,
			exitedOnItsOwn && (DateTime.UtcNow - startedAt) < budget
		);
	}

	// The guard must name the port AND the DCP symptom AND the concrete next
	// action (stop the occupier / pick another port). "Nommer la cause en clair".
	// The window is wide because in the source file the message is a multi-line
	// C# literal; in the console it is one block.
	[GeneratedRegex(
		"5454[\\s\\S]{0,1200}address already in use[\\s\\S]{0,1200}dotnet run --project apps/apphost"
	)]
	private static partial Regex PortGuardMessage();

	// The worker's launchProfileName: null must stay attached to the worker's
	// AddProject call. Whitespace-tolerant: the point is the argument, not the
	// formatting.
	[GeneratedRegex(
		"AddProject<Projects\\.PublyApp_Api>\\s*\\(\\s*\"worker\"\\s*,\\s*launchProfileName:\\s*null\\s*\\)"
	)]
	private static partial Regex WorkerLaunchProfileNull();

	// Walk further up for the repo root containing justfile (AppHost paths are
	// repo-root-relative). Same convention as CanaryProbeContainmentSpec.
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

	private sealed record AppHostRun(int ExitCode, string Console, bool ExitedOnItsOwn);
}
