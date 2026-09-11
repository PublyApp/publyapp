using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace PublyApp.Api.Infrastructure.Health;

/// <summary>
/// Keeps the HTTP readiness endpoint unhealthy until the database is reachable and every
/// migration in the running application's EF model has been applied.
/// <para>
/// Issue #2037: the description this check writes to the health response is the
/// PUBLIC surface — anyone can read it, unauthenticated and rate-limit exempt.
/// The wording therefore states the safe product cause ("the application is
/// still completing startup and setup") instead of advertising the implementation
/// detail that an EF migration is pending. Operators read the protected log
/// for the structured probe state, failure reason, and bounded migration context.
/// </para>
/// </summary>
public sealed class DatabaseMigrationHealthCheck : IHealthCheck {
	private readonly IDatabaseMigrationReadiness _MigrationReadiness;
	private readonly ILogger<DatabaseMigrationHealthCheck> _Logger;
	private readonly HealthCheckLogGate _LogGate;

	public DatabaseMigrationHealthCheck(
		IDatabaseMigrationReadiness migrationReadiness,
		ILogger<DatabaseMigrationHealthCheck> logger,
		HealthCheckLogGate logGate
	) {
		_MigrationReadiness = migrationReadiness;
		_Logger = logger;
		_LogGate = logGate;
	}

	public async Task<HealthCheckResult> CheckHealthAsync(
		HealthCheckContext context,
		CancellationToken cancellationToken = default
	) {
		try {
			var readiness = await _MigrationReadiness.IsReadyAsync(cancellationToken);
			if (readiness.IsReady) {
				var shouldLogRecovery = _LogGate.ShouldLog(
					HealthCheckMessages.DatabaseMigrationRegistrationName,
					HealthStatus.Healthy,
					failureReason: null,
					DateTimeOffset.UtcNow
				);
				if (shouldLogRecovery && _Logger.IsEnabled(LogLevel.Information)) {
					_Logger.LogInformation(
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
				_LogGate.ShouldLog(
					HealthCheckMessages.DatabaseMigrationRegistrationName,
					HealthStatus.Unhealthy,
					"pending_migrations",
					DateTimeOffset.UtcNow
				)
			) {
				_Logger.LogWarning(
					"Health check {HealthCheck} is unhealthy: {FailureReason}. "
						+ "{PendingMigrationCount} pending database migration(s). "
						+ "Sample names: {PendingMigrationNames}. "
						+ "Names truncated: {PendingMigrationNamesTruncated}. "
						+ "Next action: {PendingMigrationNextAction}",
					HealthCheckMessages.ApplicationReadinessName,
					"pending_migrations",
					readiness.PendingMigrationCount,
					pendingMigrationNames,
					readiness.PendingMigrationNamesTruncated,
					HealthCheckMessages.PendingMigrationNextAction
				);
			}

			return HealthCheckResult.Unhealthy(HealthCheckMessages.ApplicationNotReady);
		} catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
			throw;
		} catch (Exception ex) {
			if (
				_LogGate.ShouldLog(
					HealthCheckMessages.DatabaseMigrationRegistrationName,
					HealthStatus.Unhealthy,
					"database_unreachable",
					DateTimeOffset.UtcNow
				)
			) {
				_Logger.LogWarning(
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
