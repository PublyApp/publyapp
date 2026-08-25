namespace PublyApp.Api.Modules.SocialAccounts.Services;

/// <summary>
/// The session-open seam Epic D publishes through (D1 compiles against this exact
/// signature — do not rename or reshuffle). An implementation resolves the account's
/// stored credential, opens a provider session, and returns the live session values
/// without ever exposing the secret itself.
/// </summary>
public interface ISocialSessionProvider {
	Task<SocialSessionResult> OpenSessionAsync(
		Guid socialAccountId,
		CancellationToken cancellationToken
	);
}

/// <summary>A live provider session: identity plus the short-lived access token.</summary>
public sealed record SocialSession(
	string Did,
	string Handle,
	string AccessJwt,
	string PdsHost
);

/// <summary>
/// Typed outcome of a session open. Account-caused refusals are distinguished from
/// transient unavailability so callers can store a plain-words cause for refusals and
/// let jobs infrastructure retry transients. Causes are sanitised phrases — never raw
/// provider payloads, never credentials (Epic C §4).
/// </summary>
public abstract record SocialSessionResult {
	/// <summary>Session opened; <see cref="SocialAccountService"/> consumers read the session.</summary>
	public sealed record Opened(SocialSession Session) : SocialSessionResult;

	/// <summary>The account refused these credentials or does not exist (401/400-class
	/// from the provider). Nothing about the stored account may change.</summary>
	public sealed record AccountFailure(string Cause) : SocialSessionResult;

	/// <summary>Network failure, timeout, or provider 5xx. Retry with backoff belongs
	/// to the jobs infrastructure, not to this call.</summary>
	public sealed record Transient(string Cause) : SocialSessionResult;
}
