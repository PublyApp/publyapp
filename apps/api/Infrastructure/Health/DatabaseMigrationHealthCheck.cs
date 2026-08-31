using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace PublyApp.Api.Infrastructure.Health;

/// <summary>
/// Keeps the HTTP readiness endpoint unhealthy until the database is reachable and every
/// migration in the running application's EF model has been applied.
/// </summary>
public sealed class DatabaseMigrationHealthCheck : IHealthCheck {
	private readonly IDatabaseMigrationReadiness _migrationReadiness;

	public DatabaseMigrationHealthCheck(IDatabaseMigrationReadiness migrationReadiness) {
		_migrationReadiness = migrationReadiness;
	}

	public async Task<HealthCheckResult> CheckHealthAsync(
		HealthCheckContext context,
		CancellationToken cancellationToken = default
	) {
		try {
			var isReady = await _migrationReadiness.IsReadyAsync(cancellationToken);
			return isReady
				? HealthCheckResult.Healthy("Database migrations are applied.")
				: HealthCheckResult.Unhealthy("Database schema has pending migrations.");
		} catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
			throw;
		} catch (Exception ex) {
			return HealthCheckResult.Unhealthy(
				HealthCheckMessages.DatabaseUnreachable,
				ex
			);
		}
	}
}
