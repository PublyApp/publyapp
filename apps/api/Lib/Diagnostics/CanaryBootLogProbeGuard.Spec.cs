using FluentAssertions;

using PublyApp.Api.Lib.Testing.Diagnostics;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Lib.Diagnostics;

/// <summary>
/// #1319 (adversarial-review follow-up to #1317): with the probe arg the shipped
/// assembly's Main returns right after the witness gates with exit code 0 and NO host —
/// worker: no job engine; web api: no socket. A misconfigured Dokploy `command:` would
/// therefore produce a clean-looking total outage. This spec proves the guard against the
/// REAL artifact as child processes (same harness as
/// MasterKeyWitnessBootIntegrationSpec):
/// <list type="bullet">
/// <item>arg WITHOUT the test-only flag → refused with a non-zero exit and a plain-words
/// cause naming the flag, before any boot-log dump;</item>
/// <item>flag set to exactly "1" → probe accepted and markers emitted as before;</item>
/// <item>unparseable flag value → loud refusal, never a silent fallback.</item>
/// </list>
/// </summary>
public sealed class CanaryBootLogProbeGuardSpec {
	[Fact]
	public void ItShouldRefuseToStartWithAPlainWordsCauseWhenTheProbeArgComesWithoutTheTestOnlyFlag() {
		var (exitCode, stdout, stderr) = CanaryBootLogCli.RunBootProcess(
			[CanaryBootLogProbe.EmitArg],
			new Dictionary<string, string>()
		);

		exitCode.Should().Be(
			CanaryBootLogProbe.RejectedExitCode,
			"a misconfigured deployed container passing --emit-canary-boot-log must die "
				+ "loudly instead of getting the clean-looking exit-0 no-host outage; "
				+ $"stdout:\n{stdout}\nstderr:\n{stderr}");
		stderr.Should().Contain(
			CanaryBootLogProbe.TestOnlyFlagName,
			"the refusal must name the exact environment flag an operator can set (tests) "
				+ $"or leave unset (deployment); stdout:\n{stdout}\nstderr:\n{stderr}");
		stdout.Should().NotContain(
			CanaryBootLogProbe.BeginMarker,
			"a refused boot must never produce the boot-log dump; "
				+ $"stdout:\n{stdout}\nstderr:\n{stderr}");
	}

	[Fact]
	public async Task ItShouldRunTheProbeWhenTheTestOnlyFlagIsSetToExactlyOne() {
		await using var db = await WitnessTestDatabase.CreateAsync();

		var (exitCode, stdout, stderr) = CanaryBootLogCli.RunBootProcess(
			[CanaryBootLogProbe.EmitArg],
			new Dictionary<string, string> {
				[CanaryBootLogProbe.TestOnlyFlagName] = "1",
				["APP_ROLE"] = "worker",
				["POSTGRES_CONNECTION_STRING"] = db.ConnectionString,
			});

		exitCode.Should().Be(
			CanaryBootLogProbe.SuccessExitCode,
			"an explicitly test-enabled probe run must keep working end-to-end; "
				+ $"stdout:\n{stdout}\nstderr:\n{stderr}");
		stdout.Should().Contain(
			CanaryBootLogProbe.BeginMarker,
			"an accepted probe run must still produce the capture markers; "
				+ $"stdout:\n{stdout}\nstderr:\n{stderr}");
	}

	[Fact]
	public void ItShouldFailLoudWhenTheTestOnlyFlagHasAnUnparseableValue() {
		var (exitCode, stdout, stderr) = CanaryBootLogCli.RunBootProcess(
			[CanaryBootLogProbe.EmitArg],
			new Dictionary<string, string> {
				[CanaryBootLogProbe.TestOnlyFlagName] = "yes",
			});

		exitCode.Should().Be(
			CanaryBootLogProbe.RejectedExitCode,
			"an unparseable flag value must refuse the boot, never fall back silently; "
				+ $"stdout:\n{stdout}\nstderr:\n{stderr}");
		stderr.Should().Contain(
			CanaryBootLogProbe.TestOnlyFlagName,
			"the refusal must name the offending variable and the accepted values; "
				+ $"stdout:\n{stdout}\nstderr:\n{stderr}");
	}
}
