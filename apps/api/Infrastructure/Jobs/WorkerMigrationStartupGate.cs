using PublyApp.Api.Infrastructure.Health;

namespace PublyApp.Api.Infrastructure.Jobs;

public sealed record WorkerMigrationStartupGateOptions {
	public TimeSpan Timeout { get; init; } = TimeSpan.FromMinutes(5);
	public TimeSpan RetryDelay { get; init; } = TimeSpan.FromSeconds(2);
}

/// <summary>
/// Blocks worker host startup before any job-processing hosted service starts. This is
/// registered first in the worker graph because Swarm starts the migrator and applications
/// concurrently and ignores Compose dependency ordering.
/// </summary>
public sealed class WorkerMigrationStartupGate : IHostedService {
	private readonly IDatabaseMigrationReadiness _migrationReadiness;
	private readonly ILogger<WorkerMigrationStartupGate> _logger;
	private readonly WorkerMigrationStartupGateOptions _options;

	public WorkerMigrationStartupGate(
		IDatabaseMigrationReadiness migrationReadiness,
		ILogger<WorkerMigrationStartupGate> logger,
		WorkerMigrationStartupGateOptions options
	) {
		if (options.Timeout <= TimeSpan.Zero) {
			throw new ArgumentOutOfRangeException(nameof(options), "Timeout must be positive.");
		}

		if (options.RetryDelay <= TimeSpan.Zero) {
			throw new ArgumentOutOfRangeException(nameof(options), "Retry delay must be positive.");
		}

		_migrationReadiness = migrationReadiness;
		_logger = logger;
		_options = options;
	}

	public async Task StartAsync(CancellationToken cancellationToken) {
		using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(
			cancellationToken
		);
		timeoutSource.CancelAfter(_options.Timeout);
		var waitToken = timeoutSource.Token;
		var attempt = 0;

		while (!waitToken.IsCancellationRequested) {
			attempt++;
			try {
				if (await _migrationReadiness.IsReadyAsync(waitToken)) {
					_logger.LogInformation(
						"Database migrations are applied; worker startup may continue"
					);
					return;
				}

				if (_logger.IsEnabled(LogLevel.Information)) {
					_logger.LogInformation(
						"Waiting for database migrations... attempt {Attempt}",
						attempt
					);
				}
			} catch (OperationCanceledException) when (waitToken.IsCancellationRequested) {
				break;
			} catch (Exception ex) {
				_logger.LogWarning(
					ex,
					"Waiting for database migrations... database probe attempt {Attempt} failed",
					attempt
				);
			}

			try {
				await Task.Delay(_options.RetryDelay, waitToken);
			} catch (OperationCanceledException) when (waitToken.IsCancellationRequested) {
				break;
			}
		}

		cancellationToken.ThrowIfCancellationRequested();

		if (_logger.IsEnabled(LogLevel.Critical)) {
			_logger.LogCritical(
				"Worker startup timed out after {Timeout} while waiting for database migrations",
				_options.Timeout
			);
		}
		throw new TimeoutException(
			$"Database migrations were not ready within {_options.Timeout}."
		);
	}

	public Task StopAsync(CancellationToken cancellationToken) {
		return Task.CompletedTask;
	}
}
