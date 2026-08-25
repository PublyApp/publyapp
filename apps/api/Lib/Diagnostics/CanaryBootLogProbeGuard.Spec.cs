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
/// <para>
/// Round-1 fix (adversarial review r1, MEDIUM): the flag ALONE is not containment —
/// `PUBLYAPP_TEST_BOOT_PROBE=1` in a deployed container re-enables the probe and
/// reproduces the exact #1317 no-host exit-0 outage. The probe is therefore ALSO gated on
/// the hosting environment: it is honoured ONLY when ASPNETCORE_ENVIRONMENT resolves to a
/// test environment (Development/Testing); in Production, Staging, or when the host
/// environment is UNSET (what a bare container gets), the arg is refused with exit 78 even
/// WITH the flag — fail closed. These cases are proven here against the real child:
/// <list type="bullet">
/// <item>arg + flag=1 + Production → exit 78, stderr names the environment, no dump;</item>
/// <item>arg + flag=1 + environment unset → same refusal;</item>
/// <item>arg + flag=1 + Development → markers still emitted (the suite's acceptance path).</item>
/// </list>
/// </para>
/// </summary>
[CollectionDefinition("WitnessBootChildProcess", DisableParallelization = true)]
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
		// Round-1 fix: since the probe is refused outside test environments, the
		// sanctioned acceptance shape IS arg + flag + Development — proven here against
		// a real database clone.
		await using var db = await WitnessTestDatabase.CreateAsync();

		var (exitCode, stdout, stderr) = CanaryBootLogCli.RunBootProcess(
			[CanaryBootLogProbe.EmitArg],
			new Dictionary<string, string> {
				[CanaryBootLogProbe.TestOnlyFlagName] = "1",
				["ASPNETCORE_ENVIRONMENT"] = EnvironmentNames.Development,
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

	// ---- Round-1 fix (#1319): the environment clause, paired proof --------------------

	[Fact]
	public void ItShouldRefuseTheProbeInProductionEvenWhenTheTestOnlyFlagIsSet() {
		var (exitCode, stdout, stderr) = CanaryBootLogCli.RunBootProcess(
			[CanaryBootLogProbe.EmitArg],
			new Dictionary<string, string> {
				[CanaryBootLogProbe.TestOnlyFlagName] = "1",
				["ASPNETCORE_ENVIRONMENT"] = EnvironmentNames.Production,
			});

		exitCode.Should().Be(
			CanaryBootLogProbe.RejectedExitCode,
			"PUBLYAPP_TEST_BOOT_PROBE=1 inside a production-shaped container would "
				+ "re-enable the probe and reproduce the exact #1317 no-host exit-0 "
				+ "outage — the environment clause must refuse there even with the flag; "
				+ $"stdout:\n{stdout}\nstderr:\n{stderr}");
		stderr.Should().Contain(
			EnvironmentNames.Production,
			"the refusal must NAME the hosting environment so an operator can see which "
				+ $"environment refused the arg; stdout:\n{stdout}\nstderr:\n{stderr}");
		stderr.Should().Contain(
			CanaryBootLogProbe.TestOnlyFlagName,
			"the refusal must also name the ignored test-only flag; "
				+ $"stdout:\n{stdout}\nstderr:\n{stderr}");
		stdout.Should().NotContain(
			CanaryBootLogProbe.BeginMarker,
			"a refused boot must never produce the boot-log dump; "
				+ $"stdout:\n{stdout}\nstderr:\n{stderr}");
	}

	[Fact]
	public async Task ItShouldRefuseTheProbeWhenTheHostEnvironmentIsUnsetDespiteTheTestOnlyFlag() {
		await using var db = await WitnessTestDatabase.CreateAsync();

		var (exitCode, stdout, stderr) = CanaryBootLogCli.RunBootProcess(
			[CanaryBootLogProbe.EmitArg],
			new Dictionary<string, string> {
				[CanaryBootLogProbe.TestOnlyFlagName] = "1",
				// Blank pinned values strip BOTH host-environment variables from the child
				// process entirely — the bare-container shape, where the environment is
				// unset. Unset MUST count as production-shaped: fail closed.
				["ASPNETCORE_ENVIRONMENT"] = "",
				["DOTNET_ENVIRONMENT"] = "",
			});

		exitCode.Should().Be(
			CanaryBootLogProbe.RejectedExitCode,
			"a bare container has no ASPNETCORE_ENVIRONMENT/DOTNET_ENVIRONMENT at all; "
				+ "the unset case must fail closed exactly like Production, otherwise a "
				+ "flag-carrying container could still reproduce #1317's no-host outage; "
				+ $"stdout:\n{stdout}\nstderr:\n{stderr}");
		stderr.Should().Contain(
			CanaryBootLogProbe.TestOnlyFlagName,
			"the refusal must name the ignored test-only flag; "
				+ $"stdout:\n{stdout}\nstderr:\n{stderr}");
		stderr.Should().Contain(
			CanaryBootLogProbe.UnresolvedEnvironmentText,
			"with both variables absent the refusal cannot quote a resolved name, so it "
				+ "must say explicitly that the environment did not resolve to a test "
				+ $"environment; stdout:\n{stdout}\nstderr:\n{stderr}");
		stdout.Should().NotContain(
			CanaryBootLogProbe.BeginMarker,
			"a refused boot must never produce the boot-log dump; "
				+ $"stdout:\n{stdout}\nstderr:\n{stderr}");
	}

	[Fact]
	public async Task ItShouldStillRunTheProbeUnderDevelopmentWhenTheTestOnlyFlagIsSet() {
		// The Development pin keeps the acceptance path alive after the round-1
		// environment gate: the probe stays usable where tests actually run.
		await using var db = await WitnessTestDatabase.CreateAsync();

		var (exitCode, stdout, stderr) = CanaryBootLogCli.RunBootProcess(
			[CanaryBootLogProbe.EmitArg],
			new Dictionary<string, string> {
				[CanaryBootLogProbe.TestOnlyFlagName] = "1",
				["ASPNETCORE_ENVIRONMENT"] = EnvironmentNames.Development,
				["APP_ROLE"] = "worker",
				["POSTGRES_CONNECTION_STRING"] = db.ConnectionString,
			});

		exitCode.Should().Be(
			CanaryBootLogProbe.SuccessExitCode,
			"Development + explicit flag remains the sanctioned test-only shape for a "
				+ "probe run; refusing there would orphan every emit-mode consumer; "
				+ $"stdout:\n{stdout}\nstderr:\n{stderr}");
		stdout.Should().Contain(
			CanaryBootLogProbe.BeginMarker,
			"an accepted probe run must still produce the capture markers; "
				+ $"stdout:\n{stdout}\nstderr:\n{stderr}");
	}
}
