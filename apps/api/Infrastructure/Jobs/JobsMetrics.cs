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

	private static readonly Meter _Meter = new(JobsMetrics.MeterName);

	private static readonly Counter<long> _ClaimedCounter =
		JobsMetrics._Meter.CreateCounter<long>("jobs.claimed");
	private static readonly Counter<long> _SucceededCounter =
		JobsMetrics._Meter.CreateCounter<long>("jobs.succeeded");
	private static readonly Counter<long> _RetriedCounter =
		JobsMetrics._Meter.CreateCounter<long>("jobs.retried");
	private static readonly Counter<long> _DeadLetteredCounter =
		JobsMetrics._Meter.CreateCounter<long>("jobs.dead_lettered");
	private static readonly Counter<long> _CancelledCounter =
		JobsMetrics._Meter.CreateCounter<long>("jobs.cancelled");
	private static readonly Counter<long> _LeaseLostCounter =
		JobsMetrics._Meter.CreateCounter<long>("jobs.lease_lost");
	private static readonly Counter<long> _EmailSubmitFailureCounter =
		JobsMetrics._Meter.CreateCounter<long>("jobs.email_submit_failure");
	private static readonly Counter<long> _ListenerReconnectsCounter =
		JobsMetrics._Meter.CreateCounter<long>("jobs.listener_reconnects");
	private static readonly Histogram<double> _HandlerDurationHistogram =
		JobsMetrics._Meter.CreateHistogram<double>("jobs.handler_duration", unit: "s");
	private static readonly Histogram<long> _AttemptsAtTerminalHistogram =
		JobsMetrics._Meter.CreateHistogram<long>("jobs.attempts_at_terminal");

	// The "this job type is still flowing" gauge (§7.1): a stall shows up as an
	// ageing timestamp, which is detectable, where an absent counter increment is
	// just silence. Phase 3 alerts on its staleness.
	private static readonly Gauge<long> _LastSuccessAtGauge =
		JobsMetrics._Meter.CreateGauge<long>("jobs.last_success_at", unit: "s");

	private readonly KeyValuePair<string, object?> _InstanceTag;
	private readonly string _InstanceId;
	private readonly ILogger<JobsMetrics> _Logger;

	public JobsMetrics(JobWorkerInstance instance, ILogger<JobsMetrics> logger) {
		this._InstanceId = instance.Id;
		this._InstanceTag = new KeyValuePair<string, object?>("instance", this._InstanceId);
		this._Logger = logger;
	}

	public void Claimed(string jobType) {
		JobsMetrics._ClaimedCounter.Add(1, this._InstanceTag, JobsMetrics._JobTypeTag(jobType));
		this._LogEvent("jobs.claimed", jobType);
	}

	public void Succeeded(string jobType) {
		JobsMetrics._SucceededCounter.Add(1, this._InstanceTag, JobsMetrics._JobTypeTag(jobType));

		// F11 (all time is database time) governs DURABLE, safety-relevant time —
		// leases, backoff, next_attempt_at — every bit of which is SQL-computed. This
		// is neither: it is a per-replica observability sample that the alerting layer
		// reads against ITS OWN clock to judge staleness, and buying it from the
		// database would add a round-trip to the hot success path to answer a question
		// no scheduling decision asks.
		JobsMetrics._LastSuccessAtGauge.Record(
			DateTimeOffset.UtcNow.ToUnixTimeSeconds(), this._InstanceTag, JobsMetrics._JobTypeTag(jobType)
		);

		this._LogEvent("jobs.succeeded", jobType);
	}

	public void Retried(string jobType) {
		JobsMetrics._RetriedCounter.Add(1, this._InstanceTag, JobsMetrics._JobTypeTag(jobType));
		this._LogEvent("jobs.retried", jobType);
	}

	public void DeadLettered(string jobType) {
		JobsMetrics._DeadLetteredCounter.Add(1, this._InstanceTag, JobsMetrics._JobTypeTag(jobType));
		this._LogEvent("jobs.dead_lettered", jobType);
	}

	public void Cancelled(string jobType) {
		JobsMetrics._CancelledCounter.Add(1, this._InstanceTag, JobsMetrics._JobTypeTag(jobType));
		this._LogEvent("jobs.cancelled", jobType);
	}

	public void LeaseLost(string jobType) {
		JobsMetrics._LeaseLostCounter.Add(1, this._InstanceTag, JobsMetrics._JobTypeTag(jobType));

		// The lease-lost twin logs at warning: it means a lease expired mid-run,
		// which sustained is a symptom of undersized leases or stuck handlers.
		if (this._Logger.IsEnabled(LogLevel.Warning)) {
			this._Logger.LogWarning(
				"jobs.lease_lost instance={Instance} job_type={JobType}",
				this._InstanceId,
				jobType
			);
		}
	}

	public void EmailSubmitFailure(string emailKind, string failureClass) {
		JobsMetrics._EmailSubmitFailureCounter.Add(
			1,
			this._InstanceTag,
			new KeyValuePair<string, object?>("email_kind", emailKind),
			new KeyValuePair<string, object?>("failure_class", failureClass)
		);

		if (this._Logger.IsEnabled(LogLevel.Warning)) {
			this._Logger.LogWarning(
				"jobs.email_submit_failure instance={Instance} email_kind={EmailKind} "
					+ "failure_class={FailureClass}",
				this._InstanceId,
				emailKind,
				failureClass
			);
		}
	}

	// Consumed by 2C's JobQueueListener; defined here so the meter owns all signals.
	public void ListenerReconnect() {
		JobsMetrics._ListenerReconnectsCounter.Add(1, this._InstanceTag);

		if (this._Logger.IsEnabled(LogLevel.Warning)) {
			this._Logger.LogWarning("jobs.listener_reconnects instance={Instance}", this._InstanceId);
		}
	}

	public void HandlerDuration(string jobType, string outcome, double seconds) {
		JobsMetrics._HandlerDurationHistogram.Record(
			seconds,
			this._InstanceTag,
			JobsMetrics._JobTypeTag(jobType),
			new KeyValuePair<string, object?>("outcome", outcome)
		);

		if (this._Logger.IsEnabled(LogLevel.Information)) {
			this._Logger.LogInformation(
				"jobs.handler_duration instance={Instance} job_type={JobType} "
				+ "outcome={Outcome} seconds={Seconds}",
				this._InstanceId,
				jobType,
				outcome,
				seconds
			);
		}
	}

	public void AttemptsAtTerminal(string jobType, int attempts) {
		JobsMetrics._AttemptsAtTerminalHistogram.Record(attempts, this._InstanceTag, JobsMetrics._JobTypeTag(jobType));

		if (this._Logger.IsEnabled(LogLevel.Information)) {
			this._Logger.LogInformation(
				"jobs.attempts_at_terminal instance={Instance} job_type={JobType} "
				+ "attempts={Attempts}",
				this._InstanceId,
				jobType,
				attempts
			);
		}
	}

	private static KeyValuePair<string, object?> _JobTypeTag(string jobType) {
		return new KeyValuePair<string, object?>("job_type", jobType);
	}

	private void _LogEvent(string eventName, string jobType) {
		if (this._Logger.IsEnabled(LogLevel.Information)) {
			this._Logger.LogInformation(
				"{JobsEvent} instance={Instance} job_type={JobType}",
				eventName,
				this._InstanceId,
				jobType
			);
		}
	}
}
