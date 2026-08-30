using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;

using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// Guard for the Aspire AppHost's central claims (issue #1722 / PR #1840).
///
/// The AppHost (apps/apphost/Program.cs) is a top-level-statements project that this
/// test project cannot reference — an AppHost referencing the API is one direction
/// only — so the guard drives the AppHost as a process and asserts on what it
/// REPORTS: the constructed resource model (--dump-model) and the boot behavior
/// (--preflight-only, the real boot path). Round-3 review found the previous
/// source-token guards stayed green under a counter-mutation (COUNTER2) that
/// commented out .WithDataVolume(), .WithHostPort(5454) and launchProfileName: null;
/// these tests witness the ARTIFACT instead: the dump is printed by the AppHost
/// itself from the model it actually built, so a behavior removed from the source
/// is a behavior absent from the dump.
///
/// Mutation matrix (all five red, each only its named test):
///   remove .WithDataVolume()        -> ItShouldPersistPostgresDataInANamedVolume
///   remove .WithHostPort(5454)      -> ItShouldPinThePostgresHostPortTo5454
///   drop launchProfileName: null    -> ItShouldKeepTheWorkerOffTheApiPort
///   drop the port-5454 pre-flight   -> ItShouldFailLoudlyWhenHostPort5454IsAlreadyOccupied
///                                     (without the guard, DCP logs 'address already
///                                     in use' only in its internal per-resource logs,
///                                     the AppHost keeps running on an ephemeral port,
///                                     and the console never names the cause — the
///                                     behavioral run then times out and fails)
///   remove the probe's SO_REUSEADDR -> ItShouldNotMistakeTheKill9ClosingResidueOn5454ForAnOccupiedPort
///                                     (the post-crash FIN-WAIT-2 residue on
///                                     127.0.0.1:5454 reads as "occupied" — the
///                                     false positive on a healthy restart)
/// </summary>
public sealed partial class AppHostOrchestrationGuardSpec : IDisposable {
	private const int HostPort = 5454;

	// Same pin as the justfile dev-services recipe: the implicit build must not
	// run OpenAPI document generation, which boots the app with the ambient
	// .env.development (APP_ROLE=all) while no Postgres is up yet. These tests
	// exercise the AppHost model and port pre-flight, not doc-gen.
	private const string OpenApiSkipBuildProperty = "--property:OpenApiGenerateDocuments=false";

	// One shared Debug build so every child run and the residue window
	// (tcp_fin_timeout, ~60s) is not consumed by compiling the AppHost.
	private static readonly Lazy<Task> AppHostBuild = new(async () => {
		var repoRoot = FindRepoRoot();
		var run = await RunAppHostAsync(
			repoRoot,
			TimeSpan.FromMinutes(15),
			["build", "apps/apphost", "-c", "Debug", "--nologo", OpenApiSkipBuildProperty]
		);

		run.ExitedOnItsOwn.Should().BeTrue("the warm AppHost build must finish on its own");
		run.ExitCode.Should().Be(
			0,
			$"the warm AppHost build must succeed; console tail: …{ConsoleTail(run.Console)}"
		);
	});

	// The constructed-model dump, produced once per test process by the real
	// AppHost (--dump-model) and shared by the three artifact assertions.
	private static readonly Lazy<Task<string>> ModelDump = new(async () => {
		await AppHostBuild.Value;

		var repoRoot = FindRepoRoot();
		var run = await RunAppHostAsync(
			repoRoot,
			TimeSpan.FromMinutes(5),
			["run", "--project", "apps/apphost", "--no-build", OpenApiSkipBuildProperty, "--dump-model"]
		);

		run.ExitedOnItsOwn.Should().BeTrue("the --dump-model mode must exit on its own");
		run.ExitCode.Should().Be(
			0,
			$"the --dump-model mode must exit cleanly; console tail: …{ConsoleTail(run.Console)}"
		);
		return run.Console;
	});

	private TcpListener? _occupier;

	public void Dispose() {
		_occupier?.Dispose();
		_occupier = null;
	}

	[Fact]
	public async Task ItShouldPersistPostgresDataInANamedVolume() {
		var dump = await ModelDump.Value;

		NamedPostgresVolumeMount().IsMatch(dump).Should().BeTrue(
				"the AppHost must declare a NAMED volume mount on the postgres resource — "
					+ "the dump is printed by the AppHost from the model it actually built. "
					+ "Round-3 counter-mutation: commenting out .WithDataVolume() removed the "
					+ "mount from the model entirely, and every AppHost restart wiped the local "
					+ "database while the source-token guard stayed green. The source must be "
					+ "non-empty (a named volume), otherwise the token would still be satisfied "
					+ "by an anonymous mount. "
					+ $"Dump: {dump}"
			);
	}

	[Fact]
	public async Task ItShouldPinThePostgresHostPortTo5454() {
		var dump = await ModelDump.Value;

		dump.Should().Contain(
			"endpoint postgres name=tcp protocol=Tcp hostPort=5454",
			"the AppHost must pin the postgres host port to 5454 in the CONSTRUCTED model — "
				+ "the dump is printed by the AppHost from the model it actually built. "
				+ "Round-3 counter-mutation: commenting out .WithHostPort(5454) put the "
				+ "postgres container back on a random ephemeral port, so the documented "
				+ "Host=localhost;Port=5454 connection string would hit whatever else "
				+ "listens there, while the source-token guard stayed green. The port is "
				+ "part of the local development contract. "
				+ $"Dump: {dump}"
		);
	}

	[Fact]
	public async Task ItShouldKeepTheWorkerOffTheApiPort() {
		var dump = await ModelDump.Value;

		dump.Should().Contain(
			"launchProfile worker excluded",
			"the worker's constructed model must carry ExcludeLaunchProfileAnnotation — the "
				+ "dump is printed by the AppHost from the model it actually built. "
				+ "Round-3 counter-mutation: dropping launchProfileName: null made "
				+ "Aspire's AddProject select the 'http' launch profile for the worker, "
				+ "which then tried to bind the API's port 5000 (DCP proxy fails with "
				+ "'address already in use'), while the source-token guard stayed green. "
				+ "The worker must have NO launch profile: it has no HTTP endpoints. "
				+ $"Dump: {dump}"
		);
	}

	[Fact]
	public async Task ItShouldFailLoudlyWhenHostPort5454IsAlreadyOccupied() {
		// The occupied half of the port pairing: run the real AppHost against an
		// ACTIVE listener on 5454 and require a loud, self-caused failure. The
		// paired test ItShouldNotMistakeTheKill9ClosingResidueOn5454ForAnOccupiedPort
		// proves the opposite direction: a CLOSING residue (no listener) must not
		// fail. Together they pin the SO_REUSEADDR semantics: no false negative,
		// no false positive.
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

		await AppHostBuild.Value;
		var repoRoot = FindRepoRoot();
		var run = await RunAppHostAsync(
			repoRoot,
			TimeSpan.FromMinutes(10),
			["run", "--project", "apps/apphost", "--no-build", OpenApiSkipBuildProperty]
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

	[Fact]
	public async Task ItShouldNotMistakeTheKill9ClosingResidueOn5454ForAnOccupiedPort() {
		// The free half of the port pairing. The DCP postgres proxy (Go
		// net.Listen) binds 127.0.0.1:5454 WITH SO_REUSEADDR. After a hard kill
		// (kill -9, crash, DCP teardown with open proxy connections) the proxy's
		// accepted socket lingers bound on 127.0.0.1:5454 — FIN-WAIT-2 for up to
		// tcp_fin_timeout (~60s) — and a plain bind WITHOUT SO_REUSEADDR fails
		// with errno 98 (Address already in use). A pre-flight without reuse
		// therefore blocks a perfectly healthy restart (the crash-loop dev
		// flow) and prints the misleading 'stop the container listening on 5454'
		// action while no listener exists (round-4 reviewer finding, kernel demo
		// measured: fresh plain bind -> EADDRINUSE, with SO_REUSEADDR -> OK).
		//
		// This test reproduces that residue against the REAL pre-flight: it
		// spawns the AppHost's own --hold-port-5454 mode (which binds exactly
		// like DCP: SO_REUSEADDR, one accepted connection), SIGKILLs the whole
		// process tree, keeps the client side open, and runs the boot path's
		// own probe via --preflight-only. The paired halves are both executed:
		//  * --plain-bind-preflight (a faithful plain bind — no SO_REUSEADDR;
		//    .NET's managed Socket.Bind() sets SO_REUSEADDR by default on Linux,
		//    strace-verified, so the guard-only raw libc variant is the only way
		//    to reproduce the reviewer's measured state) must exit 1 with the
		//    loud 'port occupied' diagnosis — the FALSE POSITIVE this fix
		//    removes. That is the RED half.
		//  * the shipped probe (explicit SO_REUSEADDR, matching DCP) must exit 0
		//    and report the port FREE. That is the GREEN half.
		// ItShouldFailLoudlyWhenHostPort5454IsAlreadyOccupied proves an ACTIVE
		// listener still fails loudly in both halves: no false negative in
		// exchange for the fix.
		await AppHostBuild.Value;
		await using var residue = await SpawnKill9ResidueAsync();

		var repoRoot = FindRepoRoot();
		var plainRun = await RunAppHostAsync(
			repoRoot,
			TimeSpan.FromMinutes(5),
			["run", "--project", "apps/apphost", "--no-build", OpenApiSkipBuildProperty, "--preflight-only", "--plain-bind-preflight"]
		);
		var shippedRun = await RunAppHostAsync(
			repoRoot,
			TimeSpan.FromMinutes(5),
			["run", "--project", "apps/apphost", "--no-build", OpenApiSkipBuildProperty, "--preflight-only"]
		);

		// RED half: the reviewer's measured kernel hazard, executed through the
		// real pre-flight with SO_REUSEADDR dropped.
		plainRun.ExitedOnItsOwn.Should().BeTrue("the plain-bind pre-flight must finish on its own");
		plainRun.ExitCode.Should().Be(
			1,
			"a plain bind (no SO_REUSEADDR) against the post-crash closing residue on "
				+ "127.0.0.1:5454 fails with errno 98 — the false positive the round-4 "
				+ "finding measured: the pre-flight blocks a perfectly healthy restart "
				+ "and tells the user to stop a container that does not exist. This is "
				+ "the RED half of the paired proof. "
				+ $"Actual exit: {plainRun.ExitCode}. Console: {plainRun.Console}"
		);
		var plainTailStart = Math.Max(0, plainRun.Console.Length - 800);
		PortGuardMessage().IsMatch(plainRun.Console).Should().BeTrue(
			"the false positive must also print the misleading 'occupied' diagnosis "
				+ "(that is exactly what misleads the user); "
				+ $"Console tail: …{plainRun.Console[plainTailStart..]}"
		);

		// GREEN half: the shipped probe (SO_REUSEADDR, DCP semantics).
		shippedRun.ExitedOnItsOwn.Should().BeTrue(
			"the shipped pre-flight must finish on its own, fast — not sit until the budget kills it"
		);
		shippedRun.ExitCode.Should().Be(
			0,
			"with only the post-crash closing residue on 127.0.0.1:5454 and NO active "
				+ "listener, the shipped pre-flight (SO_REUSEADDR, mirroring the DCP "
				+ "proxy) must report the port FREE — the GREEN half of the paired "
				+ "proof. Pair: ItShouldFailLoudlyWhenHostPort5454IsAlreadyOccupied "
				+ "proves an active listener still fails loudly. "
				+ $"Actual exit: {shippedRun.ExitCode}. Console: {shippedRun.Console}"
		);
		shippedRun.Console.Should().Contain(
			"preflight: free",
			"the free diagnosis must be named in the console"
		);
	}

	private static async Task<Kill9Residue> SpawnKill9ResidueAsync() {
		var repoRoot = FindRepoRoot();
		var process = new Process {
			StartInfo = {
				FileName = "dotnet",
				WorkingDirectory = repoRoot,
				UseShellExecute = false,
				RedirectStandardOutput = true,
				RedirectStandardError = true,
			}
		};
		foreach (var argument in new[] {
			"run", "--project", "apps/apphost", "--no-build", OpenApiSkipBuildProperty, "--", "--hold-port-5454"
		}) {
			process.StartInfo.ArgumentList.Add(argument);
		}

		var accepted = new TaskCompletionSource(
			TaskCreationOptions.RunContinuationsAsynchronously
		);
		var console = new StringBuilder();
		void AppendOutput(object? sender, DataReceivedEventArgs args) {
			if (args.Data is null) {
				return;
			}
			lock (console) {
				console.AppendLine(args.Data);
			}
			if (args.Data.Contains("hold-port-5454: accepted", StringComparison.Ordinal)) {
				accepted.TrySetResult();
			}
		}

		process.OutputDataReceived += AppendOutput;
		process.ErrorDataReceived += AppendOutput;
		process.Start().Should().BeTrue("dotnet must be available to spawn the --hold-port-5454 child");
		process.BeginOutputReadLine();
		process.BeginErrorReadLine();

		TcpClient client = new();
		try {
			await ConnectToHoldPortAsync(process, client, console);
			await accepted.Task.WaitAsync(TimeSpan.FromSeconds(15));
			// SIGKILL the whole tree (dotnet run -> the AppHost process). The
			// accepted socket dies with the process and lingers bound as the
			// FIN-WAIT-2 orphan — the residue a killed DCP proxy leaves behind.
			process.Kill(entireProcessTree: true);
			await process.WaitForExitAsync(CancellationToken.None);
			// Let the kernel run the close handshake: FIN sent, ACK received,
			// the 5454 side parked in FIN-WAIT-2. The CLIENT STAYS OPEN: closing
			// it would send the peer FIN that moves the orphan to TIME_WAIT.
			await Task.Delay(TimeSpan.FromMilliseconds(800));
		} catch (Exception) {
			client.Dispose();
			await KillAndReapAsync(process);
			throw;
		}

		return new Kill9Residue(process, client);
	}

	private static async Task ConnectToHoldPortAsync(
		Process process,
		TcpClient client,
		StringBuilder console
	) {
		using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
		while (!cts.IsCancellationRequested) {
			if (process.HasExited) {
				string tail;
				lock (console) {
					tail = ConsoleTail(console.ToString());
				}
				throw new InvalidOperationException(
					"the --hold-port-5454 child exited before listening on 127.0.0.1:5454 "
						+ $"(exit {process.ExitCode}) — an active listener probably occupies "
						+ $"the port. Console tail: {tail}"
				);
			}

			try {
				await client.ConnectAsync(IPAddress.Loopback, HostPort, cts.Token);
				return;
			} catch (OperationCanceledException) when (cts.IsCancellationRequested) {
				// Fall through to the timeout message below.
			} catch (SocketException) {
				await Task.Delay(200, cts.Token);
			}
		}

		throw new TimeoutException(
			"the --hold-port-5454 child never started listening on 127.0.0.1:5454 within 30s"
		);
	}

	private static async Task KillAndReapAsync(Process process) {
		try {
			if (!process.HasExited) {
				process.Kill(entireProcessTree: true);
			}
			await process.WaitForExitAsync(CancellationToken.None);
		} catch (InvalidOperationException) {
			// Kill races (process already gone) are fine; disposal reaps.
		} finally {
			process.Dispose();
		}
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

		var exitCode = -1;
		try {
			if (!exitedOnItsOwn) {
				process.Kill(entireProcessTree: true);
			}

			// Drain whatever the process emitted on its way out.
			await process.WaitForExitAsync(CancellationToken.None);
			exitCode = process.ExitCode;
			process.Dispose();
		} catch (Exception) {
			// Kill races (process already gone) are fine; the assertions below
			// report the real outcome either way.
		}

		string consoleText;
		lock (console) {
			consoleText = console.ToString();
		}

		return new AppHostRun(
			exitCode,
			consoleText,
			exitedOnItsOwn && (DateTime.UtcNow - startedAt) < budget
		);
	}

	private static string ConsoleTail(string console) {
		var tailStart = Math.Max(0, console.Length - 800);
		return console[tailStart..];
	}

	// A named volume mount on the postgres resource: type=Volume with a
	// NON-EMPTY source (Aspire names the volume; an anonymous mount would print
	// source= right after the prefix).
	[GeneratedRegex("^mount postgres type=Volume source=\\S+ ", RegexOptions.Multiline)]
	private static partial Regex NamedPostgresVolumeMount();

	// The guard must name the port AND the DCP symptom AND the concrete next
	// action (stop the occupier / pick another port). "Nommer la cause en clair".
	// The window is wide because in the console the message is one block.
	[GeneratedRegex(
		"5454[\\s\\S]{0,1200}address already in use[\\s\\S]{0,1200}dotnet run --project apps/apphost"
	)]
	private static partial Regex PortGuardMessage();

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

	// The residue child: the killed --hold-port-5454 process and the client
	// connection that must stay OPEN (closing it would move the orphan from
	// FIN-WAIT-2 to TIME_WAIT before the pre-flight runs).
	private sealed class Kill9Residue(Process process, TcpClient client) : IAsyncDisposable {
		public async ValueTask DisposeAsync() {
			client.Dispose();
			await KillAndReapAsync(process);
		}
	}

	private sealed record AppHostRun(int ExitCode, string Console, bool ExitedOnItsOwn);
}
