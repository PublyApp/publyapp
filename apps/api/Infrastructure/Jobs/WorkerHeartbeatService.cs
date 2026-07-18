using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;

namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// Worker liveness writer (design §3.5, ratified O3). Because the worker role serves no
/// HTTP, the <c>/health</c> endpoint is unavailable there; instead this
/// <see cref="BackgroundService"/> touches a heartbeat file every
/// <see cref="WorkerHeartbeat.WriteInterval"/> — but only after a successful
/// <c>SELECT 1</c> against Postgres, so the file's freshness reflects DB reachability,
/// not merely "process alive". The container healthcheck runs the same assembly with
/// <c>--worker-health</c>, which reads this file (see <see cref="WorkerHealthCli"/>).
/// </summary>
public sealed class WorkerHeartbeatService : BackgroundService {
	private readonly IServiceScopeFactory _scopeFactory;
	private readonly ILogger<WorkerHeartbeatService> _logger;
	private readonly string _heartbeatPath = WorkerHeartbeat.ResolvePath();

	public WorkerHeartbeatService(
		IServiceScopeFactory scopeFactory,
		ILogger<WorkerHeartbeatService> logger
	) {
		_scopeFactory = scopeFactory;
		_logger = logger;
	}

	protected override async Task ExecuteAsync(CancellationToken stoppingToken) {
		while (!stoppingToken.IsCancellationRequested) {
			try {
				await WriteHeartbeatAsync(stoppingToken);
			} catch (Exception ex) when (ex is not OperationCanceledException) {
				// A failed DB probe (or write) is expected to leave the file stale so
				// the health probe reports unhealthy; log and keep looping.
				_logger.LogWarning(ex, "Worker heartbeat write skipped (DB probe failed)");
			}

			try {
				await Task.Delay(WorkerHeartbeat.WriteInterval, stoppingToken);
			} catch (OperationCanceledException) {
				break;
			}
		}
	}

	// Public: lets a spec drive one heartbeat deterministically instead of waiting on
	// the loop. Probes the database, then touches the heartbeat file only on success.
	public async Task WriteHeartbeatAsync(CancellationToken cancellationToken) {
		using var scope = _scopeFactory.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		// Reflects DB connectivity, not just liveness (design §3.5).
		_ = await dbContext.Database.ExecuteSqlAsync($"SELECT 1", cancellationToken);

		await WorkerHeartbeat.TouchAsync(_heartbeatPath, DateTime.UtcNow, cancellationToken);
	}
}
