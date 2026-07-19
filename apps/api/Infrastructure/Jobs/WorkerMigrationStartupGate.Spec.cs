using FluentAssertions;

using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Infrastructure.Health;

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
	public async Task ItShouldFailWorkerStartupAfterTheMigrationWaitTimeout() {
		var heartbeatPath = Path.Combine(
			Path.GetTempPath(),
			$"publyapp-worker-gate-{Guid.NewGuid():N}"
		);
		var readiness = new SequencedMigrationReadiness([false]);
		var gate = new WorkerMigrationStartupGate(
			readiness,
			NullLogger<WorkerMigrationStartupGate>.Instance,
			new WorkerMigrationStartupGateOptions {
				Timeout = TimeSpan.FromMilliseconds(30),
				RetryDelay = TimeSpan.FromMilliseconds(5),
				HeartbeatPath = heartbeatPath,
			}
		);

		var act = async () => await gate.StartAsync(CancellationToken.None);

		try {
			await act.Should().ThrowAsync<TimeoutException>();
			readiness.CallCount.Should().BeGreaterThan(1);
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

		public Task<bool> IsReadyAsync(CancellationToken cancellationToken) {
			cancellationToken.ThrowIfCancellationRequested();
			CallCount++;

			if (_results.TryDequeue(out var result)) {
				_lastResult = result;
			}

			return Task.FromResult(_lastResult);
		}
	}

	private sealed class BlockingMigrationReadiness : IDatabaseMigrationReadiness {
		private readonly TaskCompletionSource _checked = new(
			TaskCreationOptions.RunContinuationsAsynchronously
		);
		private readonly TaskCompletionSource _ready = new(
			TaskCreationOptions.RunContinuationsAsynchronously
		);

		public async Task<bool> IsReadyAsync(CancellationToken cancellationToken) {
			_checked.TrySetResult();
			await _ready.Task.WaitAsync(cancellationToken);
			return true;
		}

		public Task WaitUntilCheckedAsync() {
			return _checked.Task;
		}

		public void MarkReady() {
			_ready.TrySetResult();
		}
	}
}
