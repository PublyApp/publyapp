using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Jobs.Entities;

namespace PublyApp.Api.Infrastructure.Health;

/// <summary>
/// Readiness guard for the deployed api/worker split (issue #1716): the api
/// process has NO job consumer, so a "publish now" enqueues into job_queue and
/// the publication stays <c>Scheduled</c> until a SEPARATE worker
/// (<c>APP_ROLE=worker</c>) claims the row. When no worker is draining the
/// queue, that failure used to be silent. This check makes it loud: once a DUE
/// job (the exact predicate the claim path uses — <c>status = Pending</c> and
/// <c>next_attempt_at &lt;= now()</c>) has sat unclaimed for longer than
/// <c>JOB_QUEUE_DRAIN_STALL_SECONDS</c>, the api readiness endpoint refuses to
/// declare itself healthy and the response names the cause and the next action.
/// </summary>
public sealed class JobQueueDrainHealthCheck : IHealthCheck {
	private readonly AppDbContext _dbContext;
	private readonly TimeSpan _stallThreshold;

	public JobQueueDrainHealthCheck(AppDbContext dbContext) {
		_dbContext = dbContext;
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
			// stranded job visible in the message.
			var staleJobs = await _dbContext.JobQueue
				.Where(job =>
					job.Status == JobQueueStatus.Pending
					&& job.NextAttemptAt <= now
					&& job.NextAttemptAt < cutoff)
				.OrderBy(job => job.NextAttemptAt)
				.Select(job => new StalledJob(job.JobType, job.NextAttemptAt))
				.ToListAsync(cancellationToken);

			if (staleJobs.Count == 0) {
				return HealthCheckResult.Healthy(
					"The job queue is empty, or every due job is claimed by a worker."
				);
			}

			var oldest = staleJobs[0];
			var oldestAge = now - oldest.NextAttemptAt;
			var sampleTypes = string.Join(
				", ",
				staleJobs.Take(3).Select(job => $"'{job.JobType}'")
			);

			return HealthCheckResult.Unhealthy(
				$"{staleJobs.Count} due background job(s) (e.g. {sampleTypes}) have been waiting "
					+ $"in job_queue for over {_stallThreshold.TotalSeconds:0} seconds without a "
					+ "worker claiming them: no worker process (APP_ROLE=worker) is draining the "
					+ "queue, so publications enqueued for 'publish now' stay Scheduled "
					+ $"indefinitely. The oldest has waited {oldestAge.TotalSeconds:0} seconds. "
					+ "Start the worker, or inspect the queue yourself with: docker compose ps ; "
					+ "ss -tlnp",
				data: new Dictionary<string, object> {
					["stalledJobCount"] = staleJobs.Count,
					["oldestJobType"] = oldest.JobType,
					["oldestJobAgeSeconds"] = (int)oldestAge.TotalSeconds,
					["stallThresholdSeconds"] = (int)_stallThreshold.TotalSeconds,
				}
			);
		} catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
			throw;
		} catch (Exception ex) {
			// The queue cannot be judged, so the api must not declare itself ready:
			// the readiness answer is "I cannot tell", which is a loud failure by
			// itself (house rule: an undecidable entry fails loudly).
			return HealthCheckResult.Unhealthy(
				"The job queue could not be inspected: the database is unreachable or the "
					+ "drain state could not be read.",
				ex
			);
		}
	}

	private sealed record StalledJob(string JobType, DateTime NextAttemptAt);
}
