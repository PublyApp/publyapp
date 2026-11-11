using ILogger = Serilog.ILogger;

namespace PublyApp.Api.Lib.Logging;

/// <summary>
/// Drains the Serilog.Sinks.Async queues when the host stops (#1708). The async sinks hold
/// up to 10 000 entries on a background thread; without an explicit dispose, whatever is
/// still queued at SIGTERM / StopAsync is lost, and those are exactly the entries that
/// explain why the process stopped. Disposing the logger flushes every async sink.
/// <para>
/// Registered FIRST by ConfigureLogger so it stops LAST (hosted services stop in reverse
/// order): every other service has already finished logging when the queue is drained.
/// Runs for both roles, since both share ConfigureLogger.
/// </para>
/// </summary>
public sealed class FlushLogsOnStopHostedService : IHostedService {
	private readonly ILogger _Logger;

	public FlushLogsOnStopHostedService(ILogger logger) {
		this._Logger = logger;
	}

	public Task StartAsync(CancellationToken cancellationToken) {
		return Task.CompletedTask;
	}

	public Task StopAsync(CancellationToken cancellationToken) {
		(this._Logger as IDisposable)?.Dispose();

		return Task.CompletedTask;
	}
}
