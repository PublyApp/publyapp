using System.Diagnostics.Metrics;

namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// The engine's observability instruments (design §7.1, F21): .NET Meter
/// "PublyApp.Jobs". Every counter increment has a structured-log twin (event name +
/// same tags), so log-based alerting works before any metrics exporter exists; an
/// OTel/Prometheus exporter is a wiring follow-up, not a redesign.
/// </summary>
public sealed class JobsMetrics {
	public const string MeterName = "PublyApp.Jobs";

	private static readonly Meter Meter = new(MeterName);

	private static readonly Counter<long> ClaimedCounter =
		Meter.CreateCounter<long>("jobs.claimed");
	private static readonly Counter<long> SucceededCounter =
		Meter.CreateCounter<long>("jobs.succeeded");
	private static readonly Counter<long> RetriedCounter =
		Meter.CreateCounter<long>("jobs.retried");
	private static readonly Counter<long> DeadLetteredCounter =
		Meter.CreateCounter<long>("jobs.dead_lettered");
	private static readonly Counter<long> CancelledCounter =
		Meter.CreateCounter<long>("jobs.cancelled");
	private static readonly Counter<long> LeaseLostCounter =
		Meter.CreateCounter<long>("jobs.lease_lost");
	private static readonly Counter<long> ListenerReconnectsCounter =
		Meter.CreateCounter<long>("jobs.listener_reconnects");
	private static readonly Histogram<double> HandlerDurationHistogram =
		Meter.CreateHistogram<double>("jobs.handler_duration", unit: "s");
	private static readonly Histogram<long> AttemptsAtTerminalHistogram =
		Meter.CreateHistogram<long>("jobs.attempts_at_terminal");

	private readonly ILogger<JobsMetrics> _logger;

	public JobsMetrics(ILogger<JobsMetrics> logger) {
		_logger = logger;
	}

	public void Claimed(string jobType) {
		ClaimedCounter.Add(1, new KeyValuePair<string, object?>("job_type", jobType));
		LogEvent("jobs.claimed", jobType);
	}

	public void Succeeded(string jobType) {
		SucceededCounter.Add(1, new KeyValuePair<string, object?>("job_type", jobType));
		LogEvent("jobs.succeeded", jobType);
	}

	public void Retried(string jobType) {
		RetriedCounter.Add(1, new KeyValuePair<string, object?>("job_type", jobType));
		LogEvent("jobs.retried", jobType);
	}

	public void DeadLettered(string jobType) {
		DeadLetteredCounter.Add(1, new KeyValuePair<string, object?>("job_type", jobType));
		LogEvent("jobs.dead_lettered", jobType);
	}

	public void Cancelled(string jobType) {
		CancelledCounter.Add(1, new KeyValuePair<string, object?>("job_type", jobType));
		LogEvent("jobs.cancelled", jobType);
	}

	public void LeaseLost(string jobType) {
		LeaseLostCounter.Add(1, new KeyValuePair<string, object?>("job_type", jobType));

		// The lease-lost twin logs at warning: it means a lease expired mid-run,
		// which sustained is a symptom of undersized leases or stuck handlers.
		if (_logger.IsEnabled(LogLevel.Warning)) {
			_logger.LogWarning("jobs.lease_lost job_type={JobType}", jobType);
		}
	}

	// Consumed by 2C's JobQueueListener; defined here so the meter owns all signals.
	public void ListenerReconnect() {
		ListenerReconnectsCounter.Add(1);

		if (_logger.IsEnabled(LogLevel.Warning)) {
			_logger.LogWarning("jobs.listener_reconnects");
		}
	}

	public void HandlerDuration(string jobType, string outcome, double seconds) {
		HandlerDurationHistogram.Record(
			seconds,
			new KeyValuePair<string, object?>("job_type", jobType),
			new KeyValuePair<string, object?>("outcome", outcome)
		);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"jobs.handler_duration job_type={JobType} outcome={Outcome} seconds={Seconds}",
				jobType,
				outcome,
				seconds
			);
		}
	}

	public void AttemptsAtTerminal(string jobType, int attempts) {
		AttemptsAtTerminalHistogram.Record(
			attempts,
			new KeyValuePair<string, object?>("job_type", jobType)
		);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"jobs.attempts_at_terminal job_type={JobType} attempts={Attempts}",
				jobType,
				attempts
			);
		}
	}

	private void LogEvent(string eventName, string jobType) {
		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation("{JobsEvent} job_type={JobType}", eventName, jobType);
		}
	}
}
