using System.Diagnostics;

using PublyApp.Api.Lib.Diagnostics;

namespace PublyApp.Api.Lib.Testing.Diagnostics;

/// <summary>
/// Runs the shipped API assembly as a child process and hands back the exit code plus the
/// raw output streams (#1309/#1319 probe harness). The child inherits this process's
/// environment (Testcontainers connection string, master key), so the witness call sites
/// in Program.Main run for real — same child-process pattern as the probes in
/// AppRoleComposition.Spec and SeederGateProbeCli.
/// <para>
/// Lives under Lib/Testing so it compiles ONLY into the test project (the API csproj
/// excludes Lib/Testing/**); the shipped artifact stays untouched.
/// </para>
/// </summary>
public static class CanaryBootLogCli {
	/// <summary>
	/// Launches the API assembly in emit mode. Throws if the child exits non-zero, emits no
	/// markers (probe not wired into Main), or emits markers without a begin line.
	/// </summary>
	public static IReadOnlyList<string> CaptureBootLogLines(
		string[] assemblyArgs,
		Dictionary<string, string> env
	) {
		var (exitCode, stdout, _) = RunBootProcess(assemblyArgs, env);

		if (exitCode != CanaryBootLogProbe.SuccessExitCode) {
			throw new InvalidOperationException(
				$"Canary boot-log emit process exited {exitCode} (expected "
					+ $"{CanaryBootLogProbe.SuccessExitCode}). Stdout:\n{stdout}");
		}

		if (!stdout.Contains(CanaryBootLogProbe.BeginMarker)) {
			throw new InvalidOperationException(
				"Canary boot-log emit process produced no capture markers — is the probe "
					+ $"arg actually wired into Program.Main? Stdout:\n{stdout}");
		}

		return ExtractLines(stdout);
	}

	/// <summary>
	/// Launches the shipped assembly with the given args and returns the exit code plus
	/// both streams verbatim (#1319: the guard specs assert refusals, whose plain-words
	/// cause travels on stderr). <paramref name="env"/> keys pin/override what the boot
	/// needs. <see cref="CanaryBootLogProbe.TestOnlyFlagName"/> is REMOVED from the child
	/// environment first so a guard spec can only enable the probe through an explicit
	/// entry in <paramref name="env"/> — ambient leakage from the test process can never
	/// silently flip a refusal case into an acceptance case.
	/// </summary>
	public static (int ExitCode, string Stdout, string Stderr) RunBootProcess(
		string[] assemblyArgs,
		Dictionary<string, string> env
	) {
		var assemblyPath = typeof(Program).Assembly.Location;

		var startInfo = new ProcessStartInfo {
			FileName = Environment.ProcessPath ?? "dotnet",
			UseShellExecute = false,
			RedirectStandardOutput = true,
			RedirectStandardError = true,
			WorkingDirectory = Path.GetDirectoryName(assemblyPath),
		};

		startInfo.ArgumentList.Add("exec");
		startInfo.ArgumentList.Add(assemblyPath);
		foreach (var arg in assemblyArgs) {
			startInfo.ArgumentList.Add(arg);
		}

		// The child inherits the parent's environment (all AppEnvironment config values are
		// present as real process env vars); these keys pin/override what the boot needs.
		startInfo.Environment["ASPNETCORE_ENVIRONMENT"] = EnvironmentNames.Production;
		startInfo.Environment.Remove("DOTNET_ENVIRONMENT");
		// Hermeticity for the #1319 guard specs: strip the test-only flag unless THIS call
		// explicitly provides it, so the refusal cases below cannot be defeated by an
		// ambient PUBLYAPP_TEST_BOOT_PROBE leaking in from the test process.
		startInfo.Environment.Remove(CanaryBootLogProbe.TestOnlyFlagName);
		foreach (var (key, value) in env) {
			startInfo.Environment[key] = value;
		}

		using var process = Process.Start(startInfo)
			?? throw new InvalidOperationException("Failed to spawn the canary boot-log probe process.");
		var stdoutTask = process.StandardOutput.ReadToEndAsync();
		var stderrTask = process.StandardError.ReadToEndAsync();
		if (!process.WaitForExit(milliseconds: 120_000)) {
			process.Kill(entireProcessTree: true);
			throw new InvalidOperationException(
				"Canary boot-log emit process timed out after 120s.");
		}

		return (
			process.ExitCode,
			stdoutTask.GetAwaiter().GetResult(),
			stderrTask.GetAwaiter().GetResult()
		);
	}

	private static IReadOnlyList<string> ExtractLines(string stdout) {
		return stdout.Split('\n')
			.Where(line => line.StartsWith(CanaryBootLogProbe.LinePrefix, StringComparison.Ordinal))
			.Select(line => line[CanaryBootLogProbe.LinePrefix.Length..])
			.ToArray();
	}
}
