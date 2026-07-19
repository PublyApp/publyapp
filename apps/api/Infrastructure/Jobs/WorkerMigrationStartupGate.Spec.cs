using FluentAssertions;

using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Infrastructure.Health;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs;

public sealed class WorkerMigrationStartupGateSpec {
	[Fact]
	public async Task ItShouldWaitUntilMigrationsAreAppliedBeforeWorkerStartupCompletes() {
		var readiness = new SequencedMigrationReadiness([false, false, true]);
		var gate = new WorkerMigrationStartupGate(
			readiness,
			NullLogger<WorkerMigrationStartupGate>.Instance,
			new WorkerMigrationStartupGateOptions {
				Timeout = TimeSpan.FromSeconds(1),
				RetryDelay = TimeSpan.FromMilliseconds(1),
			}
		);

		await gate.StartAsync(CancellationToken.None);

		readiness.CallCount.Should().Be(3);
	}

	[Fact]
	public async Task ItShouldFailWorkerStartupAfterTheMigrationWaitTimeout() {
		var readiness = new SequencedMigrationReadiness([false]);
		var gate = new WorkerMigrationStartupGate(
			readiness,
			NullLogger<WorkerMigrationStartupGate>.Instance,
			new WorkerMigrationStartupGateOptions {
				Timeout = TimeSpan.FromMilliseconds(30),
				RetryDelay = TimeSpan.FromMilliseconds(5),
			}
		);

		var act = async () => await gate.StartAsync(CancellationToken.None);

		await act.Should().ThrowAsync<TimeoutException>();
		readiness.CallCount.Should().BeGreaterThan(1);
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
}
