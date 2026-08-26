using System.Collections.Frozen;

namespace PublyApp.Api.Lib.RateLimiting;

/// <summary>
/// Outcome of one conditional counter acquisition against a rate-limit counter
/// store. <see cref="Acquired"/> reports the window's new total when the permits
/// were granted; on rejection the caller learns whether the rejection came from
/// the store's own decision (window exhausted) or from an unreachable store whose
/// fail mode closed this policy.
/// </summary>
public readonly record struct CounterLeaseResult(
	bool Acquired,
	bool StoreFailure,
	long? NewPermitCount
) {
	public static CounterLeaseResult Granted(long newPermitCount) {
		return new CounterLeaseResult(true, false, newPermitCount);
	}

	public static CounterLeaseResult Rejected() {
		return new CounterLeaseResult(false, false, null);
	}

	public static CounterLeaseResult FailedStore() {
		return new CounterLeaseResult(false, true, null);
	}
}

/// <summary>
/// Shared fixed-window counter storage behind the API limiter stores (#953).
/// Implementations must be safe for concurrent use and must apply the policy's
/// fail mode themselves: <see cref="CounterFailModes.MustFailClosed"/> policies
/// reject when the store cannot be consulted; everything else admits.
/// </summary>
internal interface IRateLimitCounterStore {
	/// <summary>
	/// Attempts to take <paramref name="permitCount"/> permits from the fixed
	/// window that contains <paramref name="utcNow"/> for (policyName,
	/// partitionKey). Windows are aligned to whole multiples of the window length;
	/// a rejected acquisition consumes nothing.
	/// </summary>
	Task<CounterLeaseResult> AcquireAsync(
		string policyName,
		string partitionKey,
		int permitLimit,
		TimeSpan window,
		int permitCount,
		DateTimeOffset utcNow
	);

	ValueTask DisposeAsync();
}

/// <summary>
/// The policy families whose partitions are attacker-keyed abuse boundaries
/// (client IP / email). When the counter store is unreachable they must reject:
/// failing open would hand unlimited password-spraying, registration-flood and
/// email-bombing budgets to whoever arrives during the incident. Everything else
/// fails open — domain work already requires Postgres, so rejecting more traffic
/// during a database incident converts degradation into outage without buying
/// protection. See docs/records/2026-08-26-plan-953-distributed-rate-limiting.md.
/// </summary>
public static class CounterFailModes {
	private static readonly FrozenSet<string> FailClosedPolicies =
		new[]
			{
				AnonymousAuthRateLimitPolicies.PerIp,
				AnonymousAuthRateLimitPolicies.PerEmail,
				AnonymousAuthRateLimitPolicies.PasswordResetPerEmail,
				ApiRateLimitPolicies.EmailOperation,
				ApiRateLimitPolicies.TenantEmailOperation,
			}
			.ToFrozenSet(StringComparer.Ordinal);

	public static bool MustFailClosed(string policyName) {
		return FailClosedPolicies.Contains(policyName);
	}
}
