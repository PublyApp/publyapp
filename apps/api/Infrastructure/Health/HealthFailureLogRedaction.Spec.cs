using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib.Testing.Fakes;

using Xunit;

namespace PublyApp.Api.Infrastructure.Health;

public sealed class HealthFailureLogRedactionSpec {
	private const string SecretSentinel =
		"HealthLogSecretSentinelConnectionStringKeyToken";
	private const string SafeScopeMarker = "health-redaction-test";

	[Fact]
	public async Task ItShouldNotLogDependencyExceptionDetailsFromDatabaseMigrationHealthCheck() {
		var logger = new CapturingLogger<DatabaseMigrationHealthCheck>();
		var check = new DatabaseMigrationHealthCheck(
			new ThrowingMigrationReadiness(),
			logger,
			new HealthCheckLogGate()
		);
		using var logScope = logger.BeginScope(SafeScopeMarker);

		var result = await check.CheckHealthAsync(new HealthCheckContext());

		result.Status.Should().Be(HealthStatus.Unhealthy);
		AssertNoSentinelInLogs(logger.Entries);
	}

	[Fact]
	public async Task ItShouldNotLogDependencyExceptionDetailsFromJobQueueDrainHealthCheck() {
		var logger = new CapturingLogger<JobQueueDrainHealthCheck>();
		var check = new JobQueueDrainHealthCheck(
			new ThrowingAppDbContext(),
			logger,
			new HealthCheckLogGate()
		);
		using var logScope = logger.BeginScope(SafeScopeMarker);

		var result = await check.CheckHealthAsync(new HealthCheckContext());

		result.Status.Should().Be(HealthStatus.Unhealthy);
		AssertNoSentinelInLogs(logger.Entries);
	}

	[Fact]
	public async Task ItShouldNotLogDependencyExceptionDetailsFromWorkerMigrationStartupGate() {
		var heartbeatPath = Path.Combine(
			Path.GetTempPath(),
			$"publyapp-worker-gate-{Guid.NewGuid():N}"
		);
		var logger = new CapturingLogger<WorkerMigrationStartupGate>();
		var gate = new WorkerMigrationStartupGate(
			new ThrowingMigrationReadiness(),
			logger,
			new WorkerMigrationStartupGateOptions {
				Timeout = TimeSpan.FromMilliseconds(25),
				RetryDelay = TimeSpan.FromMilliseconds(100),
				HeartbeatPath = heartbeatPath,
			}
		);
		using var logScope = logger.BeginScope(SafeScopeMarker);

		var act = async () => await gate.StartAsync(CancellationToken.None);

		try {
			await act.Should().ThrowAsync<TimeoutException>();
			AssertNoSentinelInLogs(logger.Entries);
		} finally {
			File.Delete(heartbeatPath);
		}
	}

	private static void AssertNoSentinelInLogs(IReadOnlyList<CapturedLog> entries) {
		entries.Should().NotBeEmpty();
		foreach (var entry in entries) {
			entry.Message.Should().NotContain(SecretSentinel);
			entry.State.Should().NotContain(pair =>
				ContainsSentinel(pair.Key) || ContainsSentinel(pair.Value)
			);
			entry.Scopes.Should().Contain(SafeScopeMarker);
			entry.Scopes.Should().NotContain(scope => ContainsSentinel(scope));
			entry.Exception.Should().BeNull();
		}
	}

	private static bool ContainsSentinel(object? value) {
		return value?.ToString()?.Contains(
			SecretSentinel,
			StringComparison.Ordinal
		) is true;
	}

	private static Exception CreateHealthLogSecretSentinelConnectionStringKeyToken() {
		try {
			ThrowHealthLogSecretSentinelConnectionStringKeyToken();
		} catch (Exception exception) {
			return exception;
		}

		throw new InvalidOperationException("Sentinel exception creation did not throw.");
	}

	private static void ThrowHealthLogSecretSentinelConnectionStringKeyToken() {
		var exception = new InvalidOperationException(
			$"{SecretSentinel} Host=db.internal Port=5432 Password=secret-value"
		);
		exception.Data[SecretSentinel] = $"private-key-{SecretSentinel}";
		throw exception;
	}

	private sealed class ThrowingMigrationReadiness : IDatabaseMigrationReadiness {
		public Task<DatabaseMigrationReadinessResult> IsReadyAsync(
			CancellationToken cancellationToken
		) {
			cancellationToken.ThrowIfCancellationRequested();
			throw CreateHealthLogSecretSentinelConnectionStringKeyToken();
		}
	}

	private sealed class ThrowingAppDbContext : AppDbContext {
		public ThrowingAppDbContext() : base(new DbContextOptionsBuilder<AppDbContext>().Options) {
		}

		public override DbSet<TEntity> Set<TEntity>() {
			throw CreateHealthLogSecretSentinelConnectionStringKeyToken();
		}
	}
}
