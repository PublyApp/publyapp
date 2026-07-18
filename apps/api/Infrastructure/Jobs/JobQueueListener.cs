using Npgsql;

namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// Worker-side cross-process wake (design §5.5, O2). Holds a dedicated Npgsql connection
/// doing <c>LISTEN job_queue</c>; every transactional <c>NOTIFY job_queue</c> a producer
/// emits at commit wakes the processor loop through <see cref="IJobQueueSignal"/>.
///
/// Failure handling per §5.5:
///  - (a) no listener connected at commit → NOTIFY is dropped by Postgres, but the
///    processor's poll interval still picks the row up;
///  - (b) connection drops → on reconnect we re-LISTEN and immediately fire ONE catch-up
///    Notify(), so any wake missed while disconnected is covered; reconnects are counted
///    via <c>JobsMetrics.ListenerReconnect</c> (§7.1);
///  - (c) 8 KB payload limit → the NOTIFY payload is empty; the processor queries for
///    eligible rows anyway;
///  - (d) thundering herd → the signal coalesces and one wake drives the drain loop.
///
/// Registered only for Worker/All (design §3.2 matrix). The connection is dedicated and
/// non-pooled so a broken LISTEN socket never poisons the shared pool.
/// </summary>
public sealed class JobQueueListener : BackgroundService {
	private const string Channel = "job_queue";
	private static readonly TimeSpan ReconnectDelay = TimeSpan.FromSeconds(5);

	private readonly IJobQueueSignal _signal;
	private readonly JobsMetrics _metrics;
	private readonly ILogger<JobQueueListener> _logger;
	private readonly string _connectionString;

	public JobQueueListener(
		IJobQueueSignal signal,
		JobsMetrics metrics,
		SchedulerLeaderOptions options,
		ILogger<JobQueueListener> logger
	) {
		_signal = signal;
		_metrics = metrics;
		_logger = logger;

		// A dedicated, non-pooled connection: a long-lived LISTEN must never borrow from
		// (or break) the request/DbContext pool.
		var builder = new NpgsqlConnectionStringBuilder(options.ConnectionString) {
			Pooling = false
		};
		_connectionString = builder.ConnectionString;
	}

	protected override async Task ExecuteAsync(CancellationToken stoppingToken) {
		var firstAttempt = true;

		while (!stoppingToken.IsCancellationRequested) {
			// Every (re)connect after the first is counted as a reconnect (§7.1).
			if (!firstAttempt) {
				_metrics.ListenerReconnect();
			}

			firstAttempt = false;

			try {
				await ListenLoopAsync(stoppingToken);
			} catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) {
				break;
			} catch (Exception ex) {
				_logger.LogWarning(ex, "job_queue listener connection failed; reconnecting");

				try {
					await Task.Delay(ReconnectDelay, stoppingToken);
				} catch (OperationCanceledException) {
					break;
				}
			}
		}
	}

	// One connected lifetime: open, LISTEN, fire a catch-up wake, then block on
	// notifications until the connection drops or shutdown is requested.
	private async Task ListenLoopAsync(CancellationToken stoppingToken) {
		await using var connection = new NpgsqlConnection(_connectionString);
		await connection.OpenAsync(stoppingToken);

		connection.Notification += OnNotification;

		try {
			await using (var command = new NpgsqlCommand($"LISTEN {Channel}", connection)) {
				await command.ExecuteNonQueryAsync(stoppingToken);
			}

			// Catch-up (§5.5 (b)): anything committed while we were disconnected is
			// covered by one immediate wake — the processor queries for due rows anyway.
			_signal.Notify();

			while (!stoppingToken.IsCancellationRequested) {
				// Blocks until a NOTIFY arrives (raising the Notification event) or the
				// connection breaks. A 30 s ceiling keeps the loop responsive to shutdown.
				await connection.WaitAsync(TimeSpan.FromSeconds(30), stoppingToken);
			}
		} finally {
			connection.Notification -= OnNotification;
		}
	}

	private void OnNotification(object sender, NpgsqlNotificationEventArgs args) {
		_signal.Notify();
	}
}
