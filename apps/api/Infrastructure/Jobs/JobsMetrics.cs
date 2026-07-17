using System.Diagnostics.Metrics;

namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// The engine's observability instruments (design §7.1, F21): .NET Meter
/// "PublyApp.Jobs". Every instrument is emitted per-replica and carries the
/// <c>instance</c> tag — <see cref="JobWorkerInstance.Id"/>, the SAME value the claim
/// writes to <c>job_queue.locked_by</c> — plus <c>job_type</c> where the signal is
/// per-type. The alert layer (Phase 3) aggregates and de-duplicates by condition, not
/// by instance, which it can only do if the instance is on the wire.
///
/// Every counter increment has a structured-log twin (event name + the same tags), so
/// log-based alerting works before any metrics exporter exists; an OTel/Prometheus
/// exporter is a wiring follow-up, not a redesign.
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

	// The "this job type is still flowing" gauge (§7.1): a stall shows up as an
	// ageing timestamp, which is detectable, where an absent counter increment is
	// just silence. Phase 3 alerts on its staleness.
	private static readonly Gauge<long> LastSuccessAtGauge =
		Meter.CreateGauge<long>("jobs.last_success_at", unit: "s");

	private readonly KeyValuePair<string, object?> _instanceTag;
	private readonly string _instanceId;
	private readonly ILogger<JobsMetrics> _logger;

	public JobsMetrics(JobWorkerInstance instance, ILogger<JobsMetrics> logger) {
		_instanceId = instance.Id;
		_instanceTag = new KeyValuePair<string, object?>("instance", _instanceId);
		_logger = logger;
	}

	public void Claimed(string jobType) {
		ClaimedCounter.Add(1, _instanceTag, JobTypeTag(jobType));
		LogEvent("jobs.claimed", jobType);
	}

	public void Succeeded(string jobType) {
		SucceededCounter.Add(1, _instanceTag, JobTypeTag(jobType));

		// F11 (all time is database time) governs DURABLE, safety-relevant time —
		// leases, backoff, next_attempt_at — every bit of which is SQL-computed. This
		// is neither: it is a per-replica observability sample that the alerting layer
		// reads against ITS OWN clock to judge staleness, and buying it from the
		// database would add a round-trip to the hot success path to answer a question
		// no scheduling decision asks.
		LastSuccessAtGauge.Record(
			DateTimeOffset.UtcNow.ToUnixTimeSeconds(), _instanceTag, JobTypeTag(jobType)
		);

		LogEvent("jobs.succeeded", jobType);
	}

	public void Retried(string jobType) {
		RetriedCounter.Add(1, _instanceTag, JobTypeTag(jobType));
		LogEvent("jobs.retried", jobType);
	}

	public void DeadLettered(string jobType) {
		DeadLetteredCounter.Add(1, _instanceTag, JobTypeTag(jobType));
		LogEvent("jobs.dead_lettered", jobType);
	}

	public void Cancelled(string jobType) {
		CancelledCounter.Add(1, _instanceTag, JobTypeTag(jobType));
		LogEvent("jobs.cancelled", jobType);
	}

	public void LeaseLost(string jobType) {
		LeaseLostCounter.Add(1, _instanceTag, JobTypeTag(jobType));

		// The lease-lost twin logs at warning: it means a lease expired mid-run,
		// which sustained is a symptom of undersized leases or stuck handlers.
		if (_logger.IsEnabled(LogLevel.Warning)) {
			_logger.LogWarning(
				"jobs.lease_lost instance={Instance} job_type={JobType}",
				_instanceId,
				jobType
			);
		}
	}

	// Consumed by 2C's JobQueueListener; defined here so the meter owns all signals.
	public void ListenerReconnect() {
		ListenerReconnectsCounter.Add(1, _instanceTag);

		if (_logger.IsEnabled(LogLevel.Warning)) {
			_logger.LogWarning("jobs.listener_reconnects instance={Instance}", _instanceId);
		}
	}

	public void HandlerDuration(string jobType, string outcome, double seconds) {
		HandlerDurationHistogram.Record(
			seconds,
			_instanceTag,
			JobTypeTag(jobType),
			new KeyValuePair<string, object?>("outcome", outcome)
		);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"jobs.handler_duration instance={Instance} job_type={JobType} "
				+ "outcome={Outcome} seconds={Seconds}",
				_instanceId,
				jobType,
				outcome,
				seconds
			);
		}
	}

	public void AttemptsAtTerminal(string jobType, int attempts) {
		AttemptsAtTerminalHistogram.Record(attempts, _instanceTag, JobTypeTag(jobType));

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"jobs.attempts_at_terminal instance={Instance} job_type={JobType} "
				+ "attempts={Attempts}",
				_instanceId,
				jobType,
				attempts
			);
		}
	}

	private static KeyValuePair<string, object?> JobTypeTag(string jobType) {
		return new KeyValuePair<string, object?>("job_type", jobType);
	}

	private void LogEvent(string eventName, string jobType) {
		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"{JobsEvent} instance={Instance} job_type={JobType}",
				eventName,
				_instanceId,
				jobType
			);
		}
	}
}
