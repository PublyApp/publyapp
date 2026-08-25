using FluentAssertions;

using PublyApp.Api.Lib.Diagnostics;
using PublyApp.Api.Lib.Testing.Diagnostics;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.SocialAccounts.Infrastructure;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// #1309 (adversarial review round 1, MAJOR): the previous guard
/// (MasterKeyWitnessCallSiteSpec) counted "EnsureMasterKeyUsable" occurrences in
/// Program.cs source — a refactor that renamed the method, moved the gate behind a
/// wrapper, or deleted BOTH call sites stayed green while boot lost its refuse-to-start
/// guarantee. This spec asserts the REAL artifact instead: the shipped assembly boots as
/// a child process (worker role AND web/api role) against a REAL template-cloned Postgres
/// database and must emit exactly one canary-pass line per boot. Deleting a witness call,
/// dropping the logger argument at a call site, or breaking the wiring each turn this red.
/// <para>
/// The child inherits this process's environment (Testcontainers connection string,
/// master key), so Program.Main's real gates run exactly as deployment does — same
/// child-process pattern as AppRoleComposition.Spec's production-process probe.
/// </para>
/// </summary>
[Collection("WitnessBootChildProcess")]
public sealed class MasterKeyWitnessBootIntegrationSpec {
	[Fact]
	public async Task ItShouldEmitTheCanaryPassLineWhenTheWorkerBootsAgainstARealDatabase() {
		await using var db = await WitnessTestDatabase.CreateAsync();

		var lines = CanaryBootLogCli.CaptureBootLogLines(
			[CanaryBootLogProbe.EmitArg],
			new Dictionary<string, string> {
				["APP_ROLE"] = "worker",
				["POSTGRES_CONNECTION_STRING"] = db.ConnectionString,
			});

		lines.Should().ContainSingle(
			line => line.Contains(SocialAccountsMasterKeyWitness.CanaryPassedLogLine),
			"a REAL worker boot that passes the canary MUST log exactly one pass line; "
				+ "captured lines: " + string.Join(" | ", lines));
	}

	[Fact]
	public async Task ItShouldEmitTheCanaryPassLineWhenTheWebApiBootsAgainstARealDatabase() {
		await using var db = await WitnessTestDatabase.CreateAsync();

		var lines = CanaryBootLogCli.CaptureBootLogLines(
			[CanaryBootLogProbe.EmitArg],
			new Dictionary<string, string> {
				["APP_ROLE"] = "api",
				["POSTGRES_CONNECTION_STRING"] = db.ConnectionString,
			});

		lines.Should().ContainSingle(
			line => line.Contains(SocialAccountsMasterKeyWitness.CanaryPassedLogLine),
			"a REAL web/api boot that passes the canary MUST log exactly one pass line; "
				+ "captured lines: " + string.Join(" | ", lines));
	}
}
