using System.Collections.Concurrent;

using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace PublyApp.Api.Infrastructure.Health;

/// <summary>
/// Limits protected health-check logs produced by unauthenticated probes.
/// A status or failure-reason transition is logged immediately, while a
/// continuing failure is sampled at most once per interval.
/// </summary>
public sealed class HealthCheckLogGate {
	public static readonly TimeSpan SampleInterval = TimeSpan.FromMinutes(1);

	private readonly ConcurrentDictionary<string, LogState> _states = new(
		StringComparer.Ordinal
	);

	public bool ShouldLog(
		string checkName,
		HealthStatus status,
		string? failureReason,
		DateTimeOffset now
	) {
		var state = _states.GetOrAdd(checkName, _ => new LogState());

		lock (state) {
			if (state.LastStatus is null) {
				state.LastStatus = status;
				state.LastFailureReason = failureReason;
				state.LastLoggedAt = now;
				return status != HealthStatus.Healthy;
			}

			if (
				state.LastStatus != status
				|| !StringComparer.Ordinal.Equals(state.LastFailureReason, failureReason)
			) {
				state.LastStatus = status;
				state.LastFailureReason = failureReason;
				state.LastLoggedAt = now;
				return true;
			}

			if (
				status != HealthStatus.Healthy
				&& now - state.LastLoggedAt >= SampleInterval
			) {
				state.LastLoggedAt = now;
				return true;
			}

			return false;
		}
	}

	private sealed class LogState {
		public HealthStatus? LastStatus { get; set; }
		public string? LastFailureReason { get; set; }
		public DateTimeOffset LastLoggedAt { get; set; }
	}
}
