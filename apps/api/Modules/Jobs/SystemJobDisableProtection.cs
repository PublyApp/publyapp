namespace PublyApp.Api.Modules.Jobs;

/// <summary>
/// Domain policy naming the system jobs whose enable flag is PRIVACY-LOAD-BEARING
/// (#865, closing design §11 K-3): the seven-day sensitive-byte cap bounds
/// <em>eligibility</em>, not <em>residency</em> — token-bearing bytes leave disk only
/// on the first successful pass of their retention sweep, so that sweep's cadence IS
/// the privacy control (§7.3). Letting an operator silently disable such a schedule
/// would leave the residency window unbounded while the documented cap still reads as
/// satisfied.
///
/// This is deliberately a static policy, not configuration: which schedules carry
/// private bytes is a property of the code's data flows, decided at design time —
/// an env var could itself be misconfigured into dropping the protection. Only the
/// prepared-state retention sweep qualifies today; the other sweeps are housekeeping
/// and stay freely operator-disableable.
///
/// Consulted by <c>SyncSystemJobsJob.ReconcileAsync</c>, which reverts (never honors)
/// a disable attempt on a protected key and logs a transparent WARNING per attempt:
/// no silent drop, and never a sync failure — the rest of the reconcile continues,
/// exactly like every other per-row fault there.
/// </summary>
public static class SystemJobDisableProtection {
	// The job_keys whose disable attempt must be refused. Backed by the handlers'
	// own JobKey constants so the policy cannot drift from the sweeps it protects.
	private static readonly string[] ProtectedJobKeys =
		[Modules.Messaging.Jobs.EmailPreparedSendsRetentionHandler.JobKey];

	/// <summary>True iff flipping this definition's <c>IsEnabled</c> to false must be reverted.</summary>
	public static bool IsDisableProtected(string jobKey) {
		return ProtectedJobKeys.Contains(jobKey, StringComparer.Ordinal);
	}
}
