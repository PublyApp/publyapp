namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// In-image liveness probe for the worker role (design §3.5, ratified O3). Dispatched in
/// Program.Main before the host is built (next to BulkSeedCli.TryRun): when invoked as
/// <c>dotnet PublyApp.Api.dll --worker-health</c> it exits 0 iff the heartbeat file
/// written by <see cref="WorkerHeartbeatService"/> exists and is fresh, else 1 — with no
/// bound socket, honoring D1 ("worker serves no HTTP"). The Dokploy/Docker healthcheck
/// runs exactly this command.
/// </summary>
public static class WorkerHealthCli {
	public const string HealthArg = "--worker-health";

	// Exit codes follow the Docker healthcheck convention: 0 healthy, 1 unhealthy.
	public const int HealthyExitCode = 0;
	public const int UnhealthyExitCode = 1;

	/// <summary>
	/// Returns true iff the args request the health probe (command handled). On handling,
	/// sets <see cref="Environment.ExitCode"/> so the process exits with the probe result.
	/// </summary>
	public static bool TryRun(string[] args) {
		if (args.Length == 0
			|| !args[0].Equals(HealthArg, StringComparison.Ordinal)) {
			return false;
		}

		var isHealthy = WorkerHeartbeat.IsFresh(WorkerHeartbeat.ResolvePath(), DateTime.UtcNow);
		Environment.ExitCode = isHealthy ? HealthyExitCode : UnhealthyExitCode;
		return true;
	}
}
