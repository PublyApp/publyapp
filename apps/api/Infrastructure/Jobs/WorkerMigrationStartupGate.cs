using PublyApp.Api.Infrastructure.Health;

namespace PublyApp.Api.Infrastructure.Jobs;

public sealed record WorkerMigrationStartupGateOptions {
	public TimeSpan Timeout { get; init; } = TimeSpan.FromMinutes(5);
	public TimeSpan RetryDelay { get; init; } = TimeSpan.FromSeconds(2);
	public string HeartbeatPath { get; init; } = WorkerHeartbeat.ResolvePath();
	public bool FailFastWhenMigrationsPending { get; init; }
}

/// <summary>
/// Blocks worker host startup before any job-processing hosted service starts. This is
/// registered first in the worker graph because the deployed topology starts every service
/// concurrently: on the production instance Dokploy runs plain `docker compose` (the operator
/// log reported `Compose Type: docker-compose`), and the committed `dokploy.yml` declares no
/// `depends_on` between services. Compose therefore offers no ordering or completion guarantee,
/// so the one-shot `publyapp-migrate` task can still be applying migrations while the api and
/// worker containers come up. The worker must not process jobs or, under
/// `FailFastWhenMigrationsPending`, even finish host startup until migrations are applied, hence
/// this gate runs first and waits
/// up to <see cref="WorkerMigrationStartupGateOptions.Timeout"/>, keeping its liveness heartbeat
/// fresh the whole time.
/// </summary>
public sealed class WorkerMigrationStartupGate : IHostedService {
	private readonly IDatabaseMigrationReadiness _MigrationReadiness;
	private readonly ILogger<WorkerMigrationStartupGate> _Logger;
	private readonly WorkerMigrationStartupGateOptions _Options;

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

		_MigrationReadiness = migrationReadiness;
		_Logger = logger;
		_Options = options;
	}

	public async Task StartAsync(CancellationToken cancellationToken) {
		using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(
			cancellationToken
		);
		timeoutSource.CancelAfter(_Options.Timeout);
		var waitToken = timeoutSource.Token;
		var attempt = 0;

		while (!waitToken.IsCancellationRequested) {
			attempt++;
			var shouldFailFast = false;
			try {
				await WorkerHeartbeat.TouchAsync(
					_Options.HeartbeatPath,
					DateTime.UtcNow,
					waitToken
				);
				var readiness = await _MigrationReadiness.IsReadyAsync(waitToken);
				if (readiness.IsReady) {
					_Logger.LogInformation(
						"Database migrations are applied; worker startup may continue"
					);
					return;
				}

				if (_Options.FailFastWhenMigrationsPending) {
					shouldFailFast = true;
				} else if (_Logger.IsEnabled(LogLevel.Information)) {
					_Logger.LogInformation(
						"Waiting for database migrations... attempt {Attempt}",
						attempt
					);
				}
			} catch (OperationCanceledException) when (waitToken.IsCancellationRequested) {
				break;
			} catch (Exception) {
				_Logger.LogWarning(
					"Waiting for database migrations... liveness or database probe attempt "
						+ "{Attempt} failed",
					attempt
				);
			}

			if (shouldFailFast) {
				throw new InvalidOperationException(
					"Pending database migrations and nothing applies them in-process (since #885). "
						+ "Run 'just db-migrate' (or start with 'just dev-api-migrated'), then restart."
				);
			}

			try {
				await Task.Delay(_Options.RetryDelay, waitToken);
			} catch (OperationCanceledException) when (waitToken.IsCancellationRequested) {
				break;
			}
		}

		cancellationToken.ThrowIfCancellationRequested();

		if (_Logger.IsEnabled(LogLevel.Critical)) {
			_Logger.LogCritical(
				"Worker startup timed out after {Timeout} while waiting for database migrations",
				_Options.Timeout
			);
		}
		throw new TimeoutException(
			$"Database migrations were not ready within {_Options.Timeout}."
		);
	}

	public Task StopAsync(CancellationToken cancellationToken) {
		return Task.CompletedTask;
	}
}
