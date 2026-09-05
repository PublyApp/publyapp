using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace PublyApp.Api.Infrastructure.Health;

/// <summary>
/// Keeps the HTTP readiness endpoint unhealthy until the database is reachable and every
/// migration in the running application's EF model has been applied.
/// <para>
/// Issue #2037: the description this check writes to the health response is the
/// PUBLIC surface — anyone can read it, unauthenticated and rate-limit exempt.
/// The wording therefore states the product consequence ("the application is
/// not ready to serve traffic yet") instead of advertising the implementation
/// detail that an EF migration is pending. Operators read the protected log
/// for the structured probe state, failure reason, and bounded migration context.
/// </para>
/// </summary>
public sealed class DatabaseMigrationHealthCheck : IHealthCheck {
	private readonly IDatabaseMigrationReadiness _migrationReadiness;
	private readonly ILogger<DatabaseMigrationHealthCheck> _logger;
	private readonly HealthCheckLogGate _logGate;

	public DatabaseMigrationHealthCheck(
		IDatabaseMigrationReadiness migrationReadiness,
		ILogger<DatabaseMigrationHealthCheck> logger,
		HealthCheckLogGate logGate
	) {
		_migrationReadiness = migrationReadiness;
		_logger = logger;
		_logGate = logGate;
	}

	public async Task<HealthCheckResult> CheckHealthAsync(
		HealthCheckContext context,
		CancellationToken cancellationToken = default
	) {
		try {
			var readiness = await _migrationReadiness.IsReadyAsync(cancellationToken);
			if (readiness.IsReady) {
				var shouldLogRecovery = _logGate.ShouldLog(
					HealthCheckMessages.DatabaseMigrationRegistrationName,
					HealthStatus.Healthy,
					failureReason: null,
					DateTimeOffset.UtcNow
				);
				if (shouldLogRecovery && _logger.IsEnabled(LogLevel.Information)) {
					_logger.LogInformation(
						"Health check {HealthCheck} recovered with status {HealthStatus}.",
						HealthCheckMessages.ApplicationReadinessName,
						HealthStatus.Healthy
					);
				}

				return HealthCheckResult.Healthy(HealthCheckMessages.ApplicationReady);
			}

			var pendingMigrationNames = string.Join(
				", ",
				readiness.PendingMigrationNames
			);
			if (
				_logGate.ShouldLog(
					HealthCheckMessages.DatabaseMigrationRegistrationName,
					HealthStatus.Unhealthy,
					"pending_migrations",
					DateTimeOffset.UtcNow
				)
			) {
				_logger.LogWarning(
					"Health check {HealthCheck} is unhealthy: {FailureReason}. "
						+ "{PendingMigrationCount} pending database migration(s). "
						+ "Sample names: {PendingMigrationNames}. "
						+ "Names truncated: {PendingMigrationNamesTruncated}.",
					HealthCheckMessages.ApplicationReadinessName,
					"pending_migrations",
					readiness.PendingMigrationCount,
					pendingMigrationNames,
					readiness.PendingMigrationNamesTruncated
				);
			}

			return HealthCheckResult.Unhealthy(HealthCheckMessages.ApplicationNotReady);
		} catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
			throw;
		} catch (Exception ex) {
			if (
				_logGate.ShouldLog(
					HealthCheckMessages.DatabaseMigrationRegistrationName,
					HealthStatus.Unhealthy,
					"database_unreachable",
					DateTimeOffset.UtcNow
				)
			) {
				_logger.LogWarning(
					ex,
					"Health check {HealthCheck} is unhealthy: {FailureReason}.",
					HealthCheckMessages.ApplicationReadinessName,
					"database_unreachable"
				);
			}

			return HealthCheckResult.Unhealthy(
				HealthCheckMessages.DatabaseUnreachable,
				ex
			);
		}
	}
}
