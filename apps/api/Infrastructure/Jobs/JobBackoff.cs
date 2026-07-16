namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// The single source of truth for retry backoff, shared by both lanes (the generic
/// job queue and, from Phase 2C, the email outbox) so they can never drift apart.
/// Exponential (2^attempts seconds) capped at <see cref="MaxBackoffSeconds"/>,
/// mirroring the shipped InvitationEmailOutboxDispatcher constants
/// (MaxAttempts = 8, MaxBackoffSeconds = 900).
/// </summary>
public static class JobBackoff {
	public const int MaxAttempts = 8;
	public const int MaxBackoffSeconds = 900;

	// The wait before the next attempt: min(2^attempts, cap) seconds.
	public static TimeSpan Delay(int attempts) {
		var seconds = Math.Min(Math.Pow(2, attempts), MaxBackoffSeconds);
		return TimeSpan.FromSeconds(seconds);
	}

	// The absolute next_attempt_at, computed from a caller-supplied "now" so specs
	// can pin the reference instant. Application-side arithmetic is fine here because
	// next_attempt_at only gates re-CLAIM eligibility, which is re-evaluated against
	// database now() in the claim SQL (design §6 clock-skew stance).
	public static DateTime NextAttempt(int attempts, DateTime from) {
		return from + Delay(attempts);
	}

	public static DateTime NextAttempt(int attempts) {
		return NextAttempt(attempts, DateTime.UtcNow);
	}
}
