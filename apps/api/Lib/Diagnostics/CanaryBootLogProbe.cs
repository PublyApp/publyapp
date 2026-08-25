using System.Globalization;
using System.Collections.Concurrent;

using Serilog.Configuration;
using Serilog.Core;
using Serilog.Events;

namespace PublyApp.Api.Lib.Diagnostics;

/// <summary>
/// Boot-log probe (#1309): lets the integration suite observe the canary pass line a REAL
/// boot emits, by running the shipped assembly as a child process with
/// <see cref="EmitArg"/>. Activation is arg-gated: every normal boot (local dev, docker,
/// deployed containers, build-time doc-gen) never passes the arg, so the capture sink is
/// not attached and the exit ramps in Program.Main fall through instantly.
/// <para>
/// The witness call sites themselves stay the REAL ones in Program.Main — the probe only
/// attaches a passive in-memory Serilog sink (<see cref="AttachSinkIfRequested"/>, called
/// from LoggerConfigExtensions.BuildLoggerConfiguration) and provides a clean exit ramp
/// AFTER the boot gates (Program calls <see cref="TryExitAfterBootGate"/> in both role
/// branches), so the committed spec asserts the artifact Main actually produces, not a
/// model of it.
/// </para>
/// </summary>
public static class CanaryBootLogProbe {
	public const string EmitArg = "--emit-canary-boot-log";
	public const string LinePrefix = "CANARY_LOG:";
	public const string BeginMarker = "CANARY_BOOT_LOG_BEGIN";
	public const string EndMarker = "CANARY_BOOT_LOG_END";
	public const int SuccessExitCode = 0;
	// #1319: the probe arg is rejected unless this exact test-only environment flag is
	// also set (value "1" or "true"); see IsTestOnlyFlagSatisfied in this file.
	public const string TestOnlyFlagName = "PUBLYAPP_TEST_BOOT_PROBE";
	// Exit code for a refused boot: 78 = EX_CONFIG (sysexits.h), "configuration error",
	// so a misconfigured container command dies with a distinctly non-zero, non-crash code.
	public const int RejectedExitCode = 78;

	private static bool _requested;
	private static BootLogCaptureSink? _sink;

	/// <summary>
	/// Program.Main calls this before any host builder runs, so the capture sink exists
	/// when ConfigureLogger composes the pipeline. Returns true when the probe arg is
	/// present; every normal boot returns false and nothing is captured anywhere.
	/// <para>
	/// #1319: presence of <see cref="EmitArg"/> alone is HARD-REJECTED — the process exits
	/// non-zero (<see cref="RejectedExitCode"/>) with a plain-words cause naming
	/// <see cref="TestOnlyFlagName"/>, before any host or database connection exists.
	/// With the arg, the shipped Main would otherwise return right after the witness
	/// gates with exit code 0 and NO host started (worker: no job engine; web api: no
	/// socket) — a misconfigured container command would produce a clean-looking total
	/// outage. Only an explicit test-only flag value ("1" or "true") lets the probe run;
	/// any other value fails loud.
	/// </para>
	/// </summary>
	public static bool ActivateIfRequested(string[] args) {
		if (!args.Any(arg => arg.Equals(EmitArg, StringComparison.Ordinal))) {
			return false;
		}

		EnforceTestOnlyGate();
		_requested = true;
		_sink = new BootLogCaptureSink();
		return true;
	}

	// Exits the process when the probe arg is present without an explicit test-only
	// opt-in. Never returns on the refusal path.
	private static void EnforceTestOnlyGate() {
		var rawValue = Environment.GetEnvironmentVariable(TestOnlyFlagName);
		if (IsTestOnlyFlagValueAccepted(rawValue)) {
			return;
		}

		Console.Error.WriteLine(
			$"{EmitArg} was refused: this boot-log probe argument must never reach a "
				+ $"deployed container or a normal boot. It only works when the environment "
				+ $"variable {TestOnlyFlagName} is set to exactly '1' or 'true', which is "
				+ $"reserved for the API integration suite."
				+ (string.IsNullOrWhiteSpace(rawValue)
					? $" {TestOnlyFlagName} is not set."
					: $" {TestOnlyFlagName} has the unaccepted value '{rawValue}'."));
		Environment.Exit(RejectedExitCode);
	}

	// Exact-value contract: unset/blank refuses, "1"/"true" (case-insensitive) accepts,
	// anything else refuses loudly (never a silent fallback). Ordinal comparisons —
	// never ToLower() dispatch (PUBLY0003).
	private static bool IsTestOnlyFlagValueAccepted(string? rawValue) {
		if (string.IsNullOrWhiteSpace(rawValue)) {
			return false;
		}

		var trimmed = rawValue.Trim();
		return trimmed.Equals("1", StringComparison.Ordinal)
			|| trimmed.Equals("true", StringComparison.OrdinalIgnoreCase);
	}

	/// <summary>
	/// LoggerConfigExtensions.BuildLoggerConfiguration calls this while composing the
	/// Serilog graph: attaches the capture sink INSIDE the sanitized wrapper when (and
	/// only when) the probe activated. No-op for every normal boot.
	/// </summary>
	public static void AttachSinkIfRequested(LoggerSinkConfiguration sinkConfiguration) {
		if (_sink is not null) {
			sinkConfiguration.Sink(_sink);
		}
	}

	/// <summary>
	/// Program.Main's exit ramp, placed AFTER the master-key witness gate in BOTH role
	/// branches: when the probe activated, dumps the captured rendered messages as
	/// prefixed lines between the begin/end markers and reports the args as handled
	/// (Main returns without starting the host). Returns false immediately otherwise.
	/// </summary>
	public static bool TryExitAfterBootGate() {
		if (!_requested || _sink is null) {
			return false;
		}

		Console.WriteLine(BeginMarker);
		foreach (var message in _sink.Snapshot()) {
			Console.WriteLine(LinePrefix + message);
		}
		Console.WriteLine(EndMarker);
		Environment.ExitCode = SuccessExitCode;
		return true;
	}
}

/// <summary>
/// Passive in-memory Serilog sink used only by the boot-log probe: records every rendered
/// message that reaches the pipeline. Thread-safe; the child process reads one final
/// snapshot at the exit ramp.
/// </summary>
public sealed class BootLogCaptureSink : ILogEventSink {
	private readonly ConcurrentQueue<string> _messages = new();

	public IReadOnlyList<string> Snapshot() {
		return _messages.ToArray();
	}

	public void Emit(LogEvent logEvent) {
		_messages.Enqueue(logEvent.RenderMessage(CultureInfo.InvariantCulture));
	}
}
