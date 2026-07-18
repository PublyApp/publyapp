using System.Globalization;

namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// Shared contract for the worker liveness file-heartbeat (design §3.5, ratified O3).
/// The <see cref="WorkerHeartbeatService"/> touches the file on a successful DB probe;
/// the in-image <c>--worker-health</c> CLI reads the same file's freshness. Both sides
/// live here so the path and freshness window can never drift apart.
/// </summary>
public static class WorkerHeartbeat {
	// Under the already-writable .artifacts tree (mirrors FILE_STORAGE_ROOT and the
	// Serilog file sink), resolved relative to the process CWD — identical for the
	// worker and the probe since they share one container and filesystem.
	public const string RelativePath = ".artifacts/worker-alive";

	// Cadence at which the worker refreshes the heartbeat file.
	public static readonly TimeSpan WriteInterval = TimeSpan.FromSeconds(10);

	// The probe treats a heartbeat older than this as unhealthy.
	public static readonly TimeSpan FreshnessWindow = TimeSpan.FromSeconds(60);

	public static string ResolvePath() {
		return Path.Combine(Directory.GetCurrentDirectory(), RelativePath);
	}

	// Writes the current UTC instant to the heartbeat file (creating the directory on
	// first write). The mtime is what the probe reads; the body is for human debugging.
	public static async Task TouchAsync(
		string path,
		DateTime nowUtc,
		CancellationToken cancellationToken
	) {
		var directory = Path.GetDirectoryName(path);
		if (!string.IsNullOrEmpty(directory)) {
			Directory.CreateDirectory(directory);
		}

		await File.WriteAllTextAsync(
			path,
			nowUtc.ToString("O", CultureInfo.InvariantCulture),
			cancellationToken
		);
	}

	// True iff the heartbeat file exists and was last written within the freshness
	// window relative to nowUtc. Any IO error is treated as unhealthy (returns false).
	public static bool IsFresh(string path, DateTime nowUtc) {
		try {
			if (!File.Exists(path)) {
				return false;
			}

			var lastWriteUtc = File.GetLastWriteTimeUtc(path);
			return nowUtc - lastWriteUtc <= FreshnessWindow;
		} catch (IOException) {
			return false;
		} catch (UnauthorizedAccessException) {
			return false;
		}
	}
}
