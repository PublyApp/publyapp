using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using Npgsql;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fakes;
using PublyApp.Api.Lib.Testing.Fixtures;

using Quartz;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs;

// Drives SchedulerLeaderService's public leadership methods directly (TryBecomeLeaderAsync
// / ReleaseLeadershipAsync / IsLeader / IsSchedulerRunning) — the same
// public-methods-for-determinism discipline the processor/outbox use — so assertions never
// race the live acquire/renew loop. Two instances share the class's cloned test database
// and contend the same pg advisory lock. Each test releases both hosts in a finally so the
// session lock never leaks to the next (methods in a class share one DB and run serially).
public sealed class SchedulerLeaderServiceSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public SchedulerLeaderServiceSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	// --- leader election: exactly one winner, Quartz only on the leader ----------

	[Fact]
	public async Task ItShouldElectExactlyOneLeaderWhenTwoHostsContendTheSameLock() {
		var hostA = CreateLeader();
		var hostB = CreateLeader();

		try {
			var aAcquired = await hostA.TryBecomeLeaderAsync(CancellationToken.None);
			var bAcquired = await hostB.TryBecomeLeaderAsync(CancellationToken.None);

			aAcquired.Should().BeTrue("the first contender acquires the advisory lock");
			bAcquired.Should().BeFalse("a second session cannot take a held advisory lock");

			hostA.IsLeader.Should().BeTrue();
			hostB.IsLeader.Should().BeFalse();

			// Quartz starts ONLY on the leader; the follower never starts a scheduler.
			hostA.IsSchedulerRunning.Should().BeTrue("the leader starts its Quartz scheduler");
			hostB.IsSchedulerRunning.Should().BeFalse("a follower runs no scheduler");
		} finally {
			await hostA.ReleaseLeadershipAsync(CancellationToken.None);
			await hostB.ReleaseLeadershipAsync(CancellationToken.None);
		}
	}

	// --- failover: releasing the lock lets the follower take over ----------------

	[Fact]
	public async Task ItShouldLetAFollowerTakeOverWhenTheLeaderReleasesTheLock() {
		var hostA = CreateLeader();
		var hostB = CreateLeader();

		try {
			(await hostA.TryBecomeLeaderAsync(CancellationToken.None)).Should().BeTrue();
			(await hostB.TryBecomeLeaderAsync(CancellationToken.None)).Should().BeFalse();

			// Leader stands down: Quartz stops and the advisory lock is released.
			await hostA.ReleaseLeadershipAsync(CancellationToken.None);
			hostA.IsLeader.Should().BeFalse();
			hostA.IsSchedulerRunning.Should().BeFalse("stand-down shuts the scheduler down");

			// The former follower can now acquire and start its own scheduler.
			(await hostB.TryBecomeLeaderAsync(CancellationToken.None))
				.Should().BeTrue("the lock is free once the prior leader released it");
			hostB.IsLeader.Should().BeTrue();
			hostB.IsSchedulerRunning.Should().BeTrue();
		} finally {
			await hostA.ReleaseLeadershipAsync(CancellationToken.None);
			await hostB.ReleaseLeadershipAsync(CancellationToken.None);
		}
	}

	// --- renewal: the periodic tick keeps leadership while the connection is alive

	[Fact]
	public async Task ItShouldKeepLeadershipAcrossRenewalTicksWhileTheLockConnectionIsAlive() {
		var hostA = CreateLeader();
		var hostB = CreateLeader();

		try {
			(await hostA.TryBecomeLeaderAsync(CancellationToken.None)).Should().BeTrue();

			// Drive the SAME per-interval tick ExecuteAsync loops on: as leader it runs
			// the §5.2 implicit-renewal probe (SELECT 1 on the dedicated connection).
			// A healthy connection must retain leadership and keep Quartz running.
			await hostA.RunLeadershipTickAsync(CancellationToken.None);
			await hostA.RunLeadershipTickAsync(CancellationToken.None);

			hostA.IsLeader.Should().BeTrue("a healthy lock connection renews leadership");
			hostA.IsSchedulerRunning.Should().BeTrue("renewal must not restart or stop Quartz");

			// And the contender's tick still cannot take the held lock.
			await hostB.RunLeadershipTickAsync(CancellationToken.None);
			hostB.IsLeader.Should().BeFalse("the lock is still held by the renewing leader");
			hostB.IsSchedulerRunning.Should().BeFalse();
		} finally {
			await hostA.ReleaseLeadershipAsync(CancellationToken.None);
			await hostB.ReleaseLeadershipAsync(CancellationToken.None);
		}
	}

	// --- loss: a killed lock connection stands the leader down and migrates -----

	[Fact]
	public async Task ItShouldStandDownAndLetAFollowerTakeOverWhenTheLockConnectionDies() {
		var hostA = CreateLeader();
		var hostB = CreateLeader();

		try {
			(await hostA.TryBecomeLeaderAsync(CancellationToken.None)).Should().BeTrue();
			hostA.IsSchedulerRunning.Should().BeTrue();

			// Kill the leader's dedicated advisory-lock session server-side — the
			// real-world failure the renewal probe exists to detect (design §5.2).
			await TerminateAdvisoryLockHolderAsync();

			// The next renewal tick must observe the dead connection and stand down:
			// Quartz stopped, lock connection gone.
			await hostA.RunLeadershipTickAsync(CancellationToken.None);
			hostA.IsLeader.Should().BeFalse("a dead lock connection must cost leadership");
			hostA.IsSchedulerRunning.Should().BeFalse("stand-down must stop Quartz");

			// Leadership migrates: the surviving replica's tick acquires the freed lock.
			await hostB.RunLeadershipTickAsync(CancellationToken.None);
			hostB.IsLeader.Should().BeTrue("the terminated session released the advisory lock");
			hostB.IsSchedulerRunning.Should().BeTrue();
		} finally {
			await hostA.ReleaseLeadershipAsync(CancellationToken.None);
			await hostB.ReleaseLeadershipAsync(CancellationToken.None);
		}
	}

	// --- unconfirmed stop: leadership and lock are retained, never half-released --

	[Fact]
	public async Task ItShouldRetainLeadershipAndTheLockWhenTheSchedulerStopCannotBeConfirmed() {
		// A scheduler whose Standby/Shutdown throw — its stop can never be confirmed.
		var unstoppable = new ThrowOnStandbySchedulerFake();
		var hostA = new SchedulerLeaderService(
			new SchedulerLeaderOptions { ConnectionString = GetTestConnectionString() },
			_fixture.Factory.Services.GetRequiredService<IServiceScopeFactory>(),
			NullLogger<SchedulerLeaderService>.Instance,
			_ => Task.FromResult<IScheduler>(unstoppable)
		);
		var hostB = CreateLeader();

		try {
			(await hostA.TryBecomeLeaderAsync(CancellationToken.None)).Should().BeTrue();

			// Stand-down must ABORT: releasing the advisory lock while the scheduler
			// may still be firing would let another replica start a second scheduler.
			var release = async () => await hostA.ReleaseLeadershipAsync(CancellationToken.None);
			await release.Should().ThrowAsync<SchedulerException>(
				"an unconfirmed scheduler stop must fail the stand-down loudly"
			);

			hostA.IsLeader.Should().BeTrue(
				"the advisory lock must be retained while the scheduler stop is unconfirmed"
			);
			hostA.IsSchedulerRunning.Should().BeTrue(
				"the scheduler reference must never be discarded on an unconfirmed stop"
			);

			(await hostB.TryBecomeLeaderAsync(CancellationToken.None)).Should().BeFalse(
				"no second scheduler may start while the first one's stop is unconfirmed"
			);
			hostB.IsSchedulerRunning.Should().BeFalse();
		} finally {
			// Flip the fake to stoppable so the real advisory lock releases through the
			// normal path and cannot leak into this class's other tests.
			unstoppable.ShouldThrowOnStop = false;
			await hostA.ReleaseLeadershipAsync(CancellationToken.None);
			await hostB.ReleaseLeadershipAsync(CancellationToken.None);
		}
	}

	// --- fail-closed startup: an active-then-failed Start never half-releases -----

	[Fact]
	public async Task ItShouldRetainTheLockWhenStartupFailsAfterTheSchedulerBecameActive() {
		// Quartz's real startup hazard: the scheduler becomes active before Start()
		// returns, then Start throws — and this scheduler's stop cannot be confirmed.
		var unstoppable = new ThrowOnStandbySchedulerFake {
			ShouldThrowOnStart = true,
			ShouldThrowOnStop = true,
		};
		var hostA = new SchedulerLeaderService(
			new SchedulerLeaderOptions { ConnectionString = GetTestConnectionString() },
			_fixture.Factory.Services.GetRequiredService<IServiceScopeFactory>(),
			NullLogger<SchedulerLeaderService>.Instance,
			_ => Task.FromResult<IScheduler>(unstoppable)
		);
		var hostB = CreateLeader();

		try {
			// Acquisition must fail loudly: startup failed AND the possibly-firing
			// scheduler's stop could not be confirmed, so the release path throws
			// instead of silently releasing the lock under a live scheduler.
			var become = async () => await hostA.TryBecomeLeaderAsync(CancellationToken.None);
			await become.Should().ThrowAsync<SchedulerException>();

			// Fail-closed leadership state: lock still held, scheduler reference
			// honest about a possibly-active scheduler.
			hostA.IsLeader.Should().BeTrue(
				"the advisory lock must be retained while the failed-startup scheduler "
				+ "may still be firing"
			);
			hostA.IsSchedulerRunning.Should().BeTrue(
				"the reference to the active-but-unconfirmed scheduler must survive"
			);

			(await hostB.TryBecomeLeaderAsync(CancellationToken.None)).Should().BeFalse(
				"no second scheduler may start while the first one's stop is unconfirmed"
			);
		} finally {
			// Flip the fake to stoppable so the real advisory lock releases cleanly.
			unstoppable.ShouldThrowOnStop = false;
			await hostA.ReleaseLeadershipAsync(CancellationToken.None);
			await hostB.ReleaseLeadershipAsync(CancellationToken.None);
		}
	}

	// --- helpers ----------------------------------------------------------------

	// Server-side kill of whichever session currently holds the scheduler-leader
	// advisory lock in THIS class's cloned test database (advisory locks are
	// database-scoped, so the current_database() filter keeps parallel test classes —
	// each on its own clone — from terminating each other's leaders). Terminating the
	// backend drops the session and thus the session-level advisory lock, exactly like
	// a crashed/partitioned leader replica.
	private async Task TerminateAdvisoryLockHolderAsync() {
		const long key = SchedulerLeaderService.SchedulerLeaderLockKey;

		await using var connection = new NpgsqlConnection(GetTestConnectionString());
		await connection.OpenAsync();

		await using var command = new NpgsqlCommand(
			"""
			SELECT pg_terminate_backend(pid) FROM pg_locks
			WHERE locktype = 'advisory' AND granted
				AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
				AND ((classid::bigint << 32) | objid::bigint) = @key
			""",
			connection
		);
		command.Parameters.AddWithValue("key", key);

		var terminated = await command.ExecuteScalarAsync();
		terminated.Should().Be(
			true,
			"the leader's dedicated advisory-lock session must exist and be terminated — "
			+ "otherwise the loss assertion below would pass vacuously"
		);
	}

	private SchedulerLeaderService CreateLeader() {
		return new SchedulerLeaderService(
			new SchedulerLeaderOptions { ConnectionString = GetTestConnectionString() },
			_fixture.Factory.Services.GetRequiredService<IServiceScopeFactory>(),
			NullLogger<SchedulerLeaderService>.Instance
		);
	}

	private string GetTestConnectionString() {
		using var scope = _fixture.Factory.Services.CreateScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was unexpectedly null.");
		}

		return connectionString;
	}
}
