namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// The single source of truth for retry backoff (design §5.1/§6, F11/F12). Computes
/// DURATIONS only, never absolute timestamps: the engine applies the delay in SQL as
/// an interval added to database now(), so an app clock can never influence
/// scheduling. Schedule: d = min(15 s × 2^(n−1), 3600 s) with equal jitter
/// (d/2 + U(0, d/2)); the default 10-attempt ceiling spans ≈ 2 h before terminal.
/// </summary>
public static class JobBackoff {
	public const int DefaultMaxAttempts = 10;
	public const int BaseDelaySeconds = 15;
	public const int MaxDelaySeconds = 3600;

	/// <summary>
	/// Jittered delay (seconds) before the next try after the n-th failed attempt
	/// (1-based). Equal jitter — half deterministic, half uniform — spreads a burst
	/// of same-tick failures without ever dropping below d/2.
	/// </summary>
	public static double DelaySeconds(int failedAttemptNumber) {
		var attempt = Math.Max(1, failedAttemptNumber);
		var full = Math.Min(BaseDelaySeconds * Math.Pow(2, attempt - 1), MaxDelaySeconds);

		return (full / 2) + (Random.Shared.NextDouble() * (full / 2));
	}
}
