using FluentAssertions;

using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Infrastructure.Health;
using PublyApp.Api.Lib.Testing.Fakes;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs;

public sealed class WorkerMigrationStartupGateSpec {
	[Fact]
	public async Task ItShouldWaitUntilMigrationsAreAppliedBeforeWorkerStartupCompletes() {
		var heartbeatPath = Path.Combine(
			Path.GetTempPath(),
			$"publyapp-worker-gate-{Guid.NewGuid():N}"
		);
		var readiness = new SequencedMigrationReadiness([false, false, true]);
		var gate = new WorkerMigrationStartupGate(
			readiness,
			NullLogger<WorkerMigrationStartupGate>.Instance,
			new WorkerMigrationStartupGateOptions {
				Timeout = TimeSpan.FromSeconds(1),
				RetryDelay = TimeSpan.FromMilliseconds(1),
				HeartbeatPath = heartbeatPath,
			}
		);

		try {
			await gate.StartAsync(CancellationToken.None);

			readiness.CallCount.Should().Be(3);
			WorkerHeartbeat.IsFresh(heartbeatPath, DateTime.UtcNow).Should().BeTrue();
		} finally {
			File.Delete(heartbeatPath);
		}
	}

	[Fact]
	public async Task ItShouldWriteAFreshHeartbeatWhileWaitingForMigrations() {
		var heartbeatPath = Path.Combine(
			Path.GetTempPath(),
			$"publyapp-worker-gate-{Guid.NewGuid():N}"
		);
		var readiness = new BlockingMigrationReadiness();
		var gate = new WorkerMigrationStartupGate(
			readiness,
			NullLogger<WorkerMigrationStartupGate>.Instance,
			new WorkerMigrationStartupGateOptions {
				Timeout = TimeSpan.FromSeconds(1),
				RetryDelay = TimeSpan.FromMilliseconds(1),
				HeartbeatPath = heartbeatPath,
			}
		);
		var startTask = gate.StartAsync(CancellationToken.None);

		try {
			await readiness.WaitUntilCheckedAsync();

			WorkerHeartbeat.IsFresh(heartbeatPath, DateTime.UtcNow).Should().BeTrue();

			readiness.MarkReady();
			await startTask;
		} finally {
			readiness.MarkReady();
			File.Delete(heartbeatPath);
		}
	}

	[Fact]
	public async Task ItShouldKeepWaitingForPendingMigrationsUntilTimeoutInProduction() {
		var heartbeatPath = Path.Combine(
			Path.GetTempPath(),
			$"publyapp-worker-gate-{Guid.NewGuid():N}"
		);
		var readiness = new SequencedMigrationReadiness([false]);
		var logger = new CapturingLogger<WorkerMigrationStartupGate>();
		var gate = new WorkerMigrationStartupGate(
			readiness,
			logger,
			new WorkerMigrationStartupGateOptions {
				// Generous window: under parallel test load a Task.Delay(5ms) can
				// overshoot badly; 500ms guarantees multiple retries are observed.
				Timeout = TimeSpan.FromMilliseconds(500),
				RetryDelay = TimeSpan.FromMilliseconds(5),
				HeartbeatPath = heartbeatPath,
				FailFastWhenMigrationsPending = false,
			}
		);

		var act = async () => await gate.StartAsync(CancellationToken.None);

		try {
			var exception = await act.Should().ThrowAsync<TimeoutException>();
			exception.WithMessage("Database migrations were not ready within*");
			readiness.CallCount.Should().BeGreaterThan(1);
			logger.Entries.Should().Contain(entry => entry.Message.StartsWith(
				"Waiting for database migrations... attempt",
				StringComparison.Ordinal
			));
			logger.Entries.Should().NotContain(entry => entry.Message.Contains("just db-migrate"));
		} finally {
			File.Delete(heartbeatPath);
		}
	}

	[Fact]
	public async Task ItShouldFailFastWhenMigrationsArePendingInDevelopment() {
		var heartbeatPath = Path.Combine(
			Path.GetTempPath(),
			$"publyapp-worker-gate-{Guid.NewGuid():N}"
		);
		var readiness = new SequencedMigrationReadiness([false]);
		var gate = new WorkerMigrationStartupGate(
			readiness,
			NullLogger<WorkerMigrationStartupGate>.Instance,
			new WorkerMigrationStartupGateOptions {
				Timeout = TimeSpan.FromSeconds(1),
				RetryDelay = TimeSpan.FromMilliseconds(100),
				HeartbeatPath = heartbeatPath,
				FailFastWhenMigrationsPending = true,
			}
		);
		var act = async () => await gate.StartAsync(CancellationToken.None);

		try {
			var exception = await act.Should().ThrowAsync<InvalidOperationException>();
			exception.WithMessage("*just db-migrate*");
			readiness.CallCount.Should().Be(1);
		} finally {
			File.Delete(heartbeatPath);
		}
	}

	[Fact]
	public async Task ItShouldRetryUnreachableDatabaseWarmupInDevelopment() {
		var heartbeatPath = Path.Combine(
			Path.GetTempPath(),
			$"publyapp-worker-gate-{Guid.NewGuid():N}"
		);
		var readiness = new ThrowingThenReadyMigrationReadiness(failureCount: 2);
		var logger = new CapturingLogger<WorkerMigrationStartupGate>();
		var gate = new WorkerMigrationStartupGate(
			readiness,
			logger,
			new WorkerMigrationStartupGateOptions {
				Timeout = TimeSpan.FromSeconds(1),
				RetryDelay = TimeSpan.FromMilliseconds(1),
				HeartbeatPath = heartbeatPath,
				FailFastWhenMigrationsPending = true,
			}
		);

		try {
			await gate.StartAsync(CancellationToken.None);

			readiness.CallCount.Should().Be(3);
			logger.Entries.Count(entry => entry.Level == LogLevel.Warning).Should().Be(2);
		} finally {
			File.Delete(heartbeatPath);
		}
	}

	private sealed class SequencedMigrationReadiness : IDatabaseMigrationReadiness {
		private readonly Queue<bool> _results;
		private bool _lastResult;

		public int CallCount { get; private set; }

		public SequencedMigrationReadiness(IEnumerable<bool> results) {
			_results = new Queue<bool>(results);
			_lastResult = _results.Last();
		}

		public Task<DatabaseMigrationReadinessResult> IsReadyAsync(
			CancellationToken cancellationToken
		) {
			cancellationToken.ThrowIfCancellationRequested();
			CallCount++;

			if (_results.TryDequeue(out var result)) {
				_lastResult = result;
			}

			return Task.FromResult(
				_lastResult
					? DatabaseMigrationReadinessResult.FromPendingMigrations([])
					: DatabaseMigrationReadinessResult.FromPendingMigrations(["pending_migration"])
			);
		}
	}

	private sealed class ThrowingThenReadyMigrationReadiness : IDatabaseMigrationReadiness {
		private readonly int _failureCount;

		public int CallCount { get; private set; }

		public ThrowingThenReadyMigrationReadiness(int failureCount) {
			_failureCount = failureCount;
		}

		public Task<DatabaseMigrationReadinessResult> IsReadyAsync(
			CancellationToken cancellationToken
		) {
			cancellationToken.ThrowIfCancellationRequested();
			CallCount++;

			if (CallCount <= _failureCount) {
				throw new InvalidOperationException("Database is still starting.");
			}

			return Task.FromResult(DatabaseMigrationReadinessResult.FromPendingMigrations([]));
		}
	}

	private sealed class BlockingMigrationReadiness : IDatabaseMigrationReadiness {
		private readonly TaskCompletionSource _checked = new(
			TaskCreationOptions.RunContinuationsAsynchronously
		);
		private readonly TaskCompletionSource _ready = new(
			TaskCreationOptions.RunContinuationsAsynchronously
		);

		public async Task<DatabaseMigrationReadinessResult> IsReadyAsync(
			CancellationToken cancellationToken
		) {
			_checked.TrySetResult();
			await _ready.Task.WaitAsync(cancellationToken);
			return DatabaseMigrationReadinessResult.FromPendingMigrations([]);
		}

		public Task WaitUntilCheckedAsync() {
			return _checked.Task;
		}

		public void MarkReady() {
			_ready.TrySetResult();
		}
	}

}
