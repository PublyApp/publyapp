using FluentAssertions;

using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Infrastructure.Health;
using PublyApp.Api.Lib;

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

	[Fact]
	public async Task ItShouldEmitActionableMigrationCueAfterThresholdInDevelopment() {
		await RunInEnvironmentAsync(EnvironmentNames.Development, async () => {
			var heartbeatPath = Path.Combine(
				Path.GetTempPath(),
				$"publyapp-worker-gate-{Guid.NewGuid():N}"
			);
			var readiness = new SequencedMigrationReadiness([false, false, false, true]);
			var logger = new CapturingLogger<WorkerMigrationStartupGate>();
			var gate = new WorkerMigrationStartupGate(
				readiness,
				logger,
				new WorkerMigrationStartupGateOptions {
					Timeout = TimeSpan.FromSeconds(1),
					RetryDelay = TimeSpan.FromMilliseconds(1),
					HeartbeatPath = heartbeatPath,
				}
			);

			try {
				await gate.StartAsync(CancellationToken.None);

				logger.Entries
					.Where(entry => entry.Level == LogLevel.Warning)
					.Should()
					.ContainSingle(entry => entry.Message.Contains("just db-migrate"));
			} finally {
				File.Delete(heartbeatPath);
			}
		});
	}

	[Fact]
	public async Task ItShouldNotEmitActionableMigrationCueInProduction() {
		await RunInEnvironmentAsync(EnvironmentNames.Production, async () => {
			var heartbeatPath = Path.Combine(
				Path.GetTempPath(),
				$"publyapp-worker-gate-{Guid.NewGuid():N}"
			);
			var readiness = new SequencedMigrationReadiness([false, false, false, true]);
			var logger = new CapturingLogger<WorkerMigrationStartupGate>();
			var gate = new WorkerMigrationStartupGate(
				readiness,
				logger,
				new WorkerMigrationStartupGateOptions {
					Timeout = TimeSpan.FromSeconds(1),
					RetryDelay = TimeSpan.FromMilliseconds(1),
					HeartbeatPath = heartbeatPath,
				}
			);

			try {
				await gate.StartAsync(CancellationToken.None);

				logger.Entries.Should().NotContain(entry => entry.Level == LogLevel.Warning);
				logger.Entries
					.Count(entry => entry.Message.StartsWith(
						"Waiting for database migrations",
						StringComparison.Ordinal
					))
					.Should()
					.Be(3);
			} finally {
				File.Delete(heartbeatPath);
			}
		});
	}

	private static async Task RunInEnvironmentAsync(
		string environmentName,
		Func<Task> action
	) {
		var previousEnvironment = Environment.GetEnvironmentVariable(
			"ASPNETCORE_ENVIRONMENT"
		);
		Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", environmentName);

		try {
			await action();
		} finally {
			Environment.SetEnvironmentVariable(
				"ASPNETCORE_ENVIRONMENT",
				previousEnvironment
			);
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

	private sealed class CapturingLogger<T> : ILogger<T> {
		public sealed record Entry(LogLevel Level, string Message);

		public List<Entry> Entries { get; } = [];

		public IDisposable BeginScope<TState>(TState state) where TState : notnull {
			return NullScope.Instance;
		}

		public bool IsEnabled(LogLevel logLevel) {
			return true;
		}

		public void Log<TState>(
			LogLevel logLevel,
			EventId eventId,
			TState state,
			Exception? exception,
			Func<TState, Exception?, string> formatter
		) {
			Entries.Add(new Entry(logLevel, formatter(state, exception)));
		}

		private sealed class NullScope : IDisposable {
			public static readonly NullScope Instance = new();

			public void Dispose() {
			}
		}
	}
}
