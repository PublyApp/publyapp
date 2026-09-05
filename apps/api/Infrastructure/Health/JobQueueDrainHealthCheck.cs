using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Jobs.Entities;

namespace PublyApp.Api.Infrastructure.Health;

/// <summary>
/// Drain guard for the deployed api/worker split (issue #1716): the api
/// process has NO job consumer, so a "publish now" enqueues into the queue and
/// the publication stays <c>Scheduled</c> until a SEPARATE worker claims the
/// row. When no worker is draining the queue, that failure used to be silent.
/// This check makes it loud once a DUE job has sat unclaimed for longer than
/// <c>JOB_QUEUE_DRAIN_STALL_SECONDS</c>.
/// <para>
/// The check lives on the NON-ROUTING <c>/health/drain</c> surface only.
/// Readiness probes decide ROUTING, and the api can serve every request while
/// the worker is down — only background drain stalls, and only the worker can
/// fix that. A probe that answers "is a dependency healthy" must never be
/// allowed to take the api offline (review round 2): the drain surface names
/// the cause (503 + plain words) for an operator or monitor, while
/// <c>/health/ready</c> keeps returning 200.
/// </para>
/// <para>
/// Issue #2037: the description this check writes to the health response is
/// the PUBLIC surface — anyone can read it, unauthenticated and rate-limit
/// exempt. The wording is therefore kept to a product consequence ("scheduled
/// publications are not being sent") so a monitoring system knows the system
/// is degraded without learning internal naming. The operational detail — the
/// job type, queue depth, age of the oldest stranded job, the stall threshold,
/// and the next action — is logged at <see cref="LogLevel.Warning"/> on the
/// protected logger so an operator can read it from the durable log stream.
/// </para>
/// </summary>
public sealed class JobQueueDrainHealthCheck : IHealthCheck {
	private readonly AppDbContext _dbContext;
	private readonly TimeSpan _stallThreshold;
	private readonly ILogger<JobQueueDrainHealthCheck> _logger;
	private readonly HealthCheckLogGate _logGate;

	public JobQueueDrainHealthCheck(
		AppDbContext dbContext,
		ILogger<JobQueueDrainHealthCheck> logger,
		HealthCheckLogGate logGate
	) {
		_dbContext = dbContext;
		_logger = logger;
		_logGate = logGate;
		_stallThreshold = TimeSpan.FromSeconds(
			AppEnvironment.Instance.JOB_QUEUE_DRAIN_STALL_SECONDS
		);
	}

	public async Task<HealthCheckResult> CheckHealthAsync(
		HealthCheckContext context,
		CancellationToken cancellationToken = default
	) {
		try {
			var now = DateTime.UtcNow;
			var cutoff = now - _stallThreshold;

			// The same due predicate the worker's claim uses (status = Pending AND
			// next_attempt_at <= now()); the oldest-first ordering keeps the oldest
			// stranded job visible in the log entry.
			var staleJobs = await _dbContext.JobQueue
				.Where(job =>
					job.Status == JobQueueStatus.Pending
					&& job.NextAttemptAt <= now
					&& job.NextAttemptAt < cutoff)
				.OrderBy(job => job.NextAttemptAt)
				.Select(job => new StalledJob(job.JobType, job.NextAttemptAt))
				.ToListAsync(cancellationToken);

			if (staleJobs.Count == 0) {
				if (
					_logGate.ShouldLog(
						HealthCheckMessages.JobQueueDrainRegistrationName,
						HealthStatus.Healthy,
						failureReason: null,
						DateTimeOffset.UtcNow
					)
				) {
					if (_logger.IsEnabled(LogLevel.Information)) {
						_logger.LogInformation(
							"Health check {HealthCheck} recovered with status {HealthStatus}.",
							HealthCheckMessages.PublicationDeliveryName,
							HealthStatus.Healthy
						);
					}
				}

				return HealthCheckResult.Healthy(
					HealthCheckMessages.ScheduledPublicationsBeingSent
				);
			}

			var oldest = staleJobs[0];
			var oldestAge = now - oldest.NextAttemptAt;
			var sampleTypes = string.Join(
				", ",
				staleJobs.Take(3).Select(job => job.JobType)
			);

			if (
				_logGate.ShouldLog(
					HealthCheckMessages.JobQueueDrainRegistrationName,
					HealthStatus.Unhealthy,
					"stalled_jobs",
					DateTimeOffset.UtcNow
				)
			) {
				_logger.LogWarning(
					"Health check {HealthCheck} is unhealthy: {FailureReason}. "
						+ "{StalledJobCount} due background job(s) waited past the "
						+ "{StallThresholdSeconds}s threshold. Sample types: {SampleJobTypes}. "
						+ "The oldest waited {OldestJobAgeSeconds}s. Start the worker to "
						+ "resume sending scheduled publications.",
					HealthCheckMessages.PublicationDeliveryName,
					"stalled_jobs",
					staleJobs.Count,
					(int)_stallThreshold.TotalSeconds,
					sampleTypes,
					(int)oldestAge.TotalSeconds
				);
			}

			return HealthCheckResult.Unhealthy(
				HealthCheckMessages.ScheduledPublicationsNotBeingSent,
				data: new Dictionary<string, object> {
					// Operational fields are still carried on the result for any
					// internal consumer that resolves the health check directly
					// (not via the public endpoint). The PUBLIC JSON writer does
					// not serialize these — see HealthResponseWriter.
					["stalledJobCount"] = staleJobs.Count,
					["oldestJobType"] = oldest.JobType,
					["oldestJobAgeSeconds"] = (int)oldestAge.TotalSeconds,
					["stallThresholdSeconds"] = (int)_stallThreshold.TotalSeconds,
				}
			);
		} catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
			throw;
		} catch (Exception ex) {
			// The queue cannot be judged, so the drain surface must not declare
			// itself healthy: "I cannot tell" is a loud failure by itself.
			if (
				_logGate.ShouldLog(
					HealthCheckMessages.JobQueueDrainRegistrationName,
					HealthStatus.Unhealthy,
					"database_unreachable",
					DateTimeOffset.UtcNow
				)
			) {
				_logger.LogWarning(
					ex,
					"Health check {HealthCheck} is unhealthy: {FailureReason}.",
					HealthCheckMessages.PublicationDeliveryName,
					"database_unreachable"
				);
			}
			return HealthCheckResult.Unhealthy(
				HealthCheckMessages.DatabaseUnreachable,
				ex
			);
		}
	}

	private sealed record StalledJob(string JobType, DateTime NextAttemptAt);
}
