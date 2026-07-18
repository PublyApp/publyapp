using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs;

// Covers the O3 worker-liveness pair end to end (design §3.5): WorkerHeartbeatService's
// DB-gated file write (driven via its public WriteHeartbeatAsync, never the live loop)
// and WorkerHealthCli's --worker-health exit codes. All tests live in ONE class because
// xUnit runs a class's methods serially and the heartbeat file is a fixed CWD-relative
// path — a second parallel class would race it. Staleness is produced by backdating the
// file's mtime (File.SetLastWriteTimeUtc), never by sleeping.
public sealed class WorkerHeartbeatServiceSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly string _heartbeatPath = WorkerHeartbeat.ResolvePath();

	public WorkerHeartbeatServiceSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	// --- heartbeat writer: DB probe gates the file --------------------------------

	[Fact]
	public async Task ItShouldWriteAFreshHeartbeatOnlyAfterASuccessfulDatabaseProbe() {
		DeleteHeartbeatFile();

		// Scope factory resolving the REAL (Testcontainers) database → SELECT 1 succeeds.
		var service = new WorkerHeartbeatService(
			_fixture.Factory.Services.GetRequiredService<IServiceScopeFactory>(),
			NullLogger<WorkerHeartbeatService>.Instance
		);

		await service.WriteHeartbeatAsync(CancellationToken.None);

		File.Exists(_heartbeatPath).Should().BeTrue("a successful DB probe writes the heartbeat");
		WorkerHeartbeat.IsFresh(_heartbeatPath, DateTime.UtcNow)
			.Should().BeTrue("a just-written heartbeat is inside the freshness window");
	}

	[Fact]
	public async Task ItShouldNotWriteAHeartbeatWhenTheDatabaseProbeFails() {
		DeleteHeartbeatFile();

		// Scope factory whose AppDbContext points at a dead endpoint → SELECT 1 fails.
		var services = new ServiceCollection();
		services.AddDbContext<AppDbContext>(options => options.UseNpgsql(
			"Host=127.0.0.1;Port=9;Database=unreachable;Username=x;Password=x;Timeout=1;"
		));
		await using var provider = services.BuildServiceProvider();

		var service = new WorkerHeartbeatService(
			provider.GetRequiredService<IServiceScopeFactory>(),
			NullLogger<WorkerHeartbeatService>.Instance
		);

		var act = async () => await service.WriteHeartbeatAsync(CancellationToken.None);

		await act.Should().ThrowAsync<Exception>("the DB probe cannot reach the endpoint");
		File.Exists(_heartbeatPath).Should().BeFalse(
			"the heartbeat must reflect DB reachability — a failed probe writes nothing, "
			+ "letting the file go stale so --worker-health reports unhealthy"
		);
	}

	// --- --worker-health CLI: exit 0 fresh / 1 stale / 1 missing ------------------

	[Fact]
	public async Task ItShouldExitHealthyFromTheWorkerHealthCliWhenTheHeartbeatIsFresh() {
		await WorkerHeartbeat.TouchAsync(_heartbeatPath, DateTime.UtcNow, CancellationToken.None);

		RunWorkerHealthCli().Should().Be(WorkerHealthCli.HealthyExitCode);
	}

	[Fact]
	public async Task ItShouldExitUnhealthyFromTheWorkerHealthCliWhenTheHeartbeatIsStale() {
		await WorkerHeartbeat.TouchAsync(_heartbeatPath, DateTime.UtcNow, CancellationToken.None);
		// Backdate the mtime just past the 60 s freshness window — no sleeping.
		File.SetLastWriteTimeUtc(
			_heartbeatPath,
			DateTime.UtcNow - WorkerHeartbeat.FreshnessWindow - TimeSpan.FromSeconds(5)
		);

		RunWorkerHealthCli().Should().Be(WorkerHealthCli.UnhealthyExitCode);
	}

	[Fact]
	public void ItShouldExitUnhealthyFromTheWorkerHealthCliWhenTheHeartbeatFileIsMissing() {
		DeleteHeartbeatFile();

		RunWorkerHealthCli().Should().Be(WorkerHealthCli.UnhealthyExitCode);
	}

	[Fact]
	public void ItShouldNotHandleArgsOtherThanWorkerHealth() {
		// Guards the CLI dispatch seam: anything else must fall through to the host.
		WorkerHealthCli.TryRun(["seed-bulk"]).Should().BeFalse();
		WorkerHealthCli.TryRun([]).Should().BeFalse();
	}

	// --- helpers -------------------------------------------------------------------

	// Runs the probe exactly as Program.Main dispatches it and returns the exit code it
	// set, restoring Environment.ExitCode so a probe result never leaks into the test
	// runner's own exit status.
	private static int RunWorkerHealthCli() {
		var originalExitCode = Environment.ExitCode;
		try {
			WorkerHealthCli.TryRun([WorkerHealthCli.HealthArg])
				.Should().BeTrue("--worker-health must be handled by the CLI");
			return Environment.ExitCode;
		} finally {
			Environment.ExitCode = originalExitCode;
		}
	}

	private void DeleteHeartbeatFile() {
		if (File.Exists(_heartbeatPath)) {
			File.Delete(_heartbeatPath);
		}
	}
}
