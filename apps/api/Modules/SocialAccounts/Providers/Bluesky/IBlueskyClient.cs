namespace PublyApp.Api.Modules.SocialAccounts.Providers.Bluesky;

/// <summary>
/// Credentials presented to a Bluesky session open (Epic C §1 decision 3: app password
/// now, OAuth later). The app password is write-only from this seam's point of view: it
/// travels inside the session-open request and must never be logged, returned, or
/// persisted in cleartext anywhere (Epic C §4).
/// </summary>
public sealed record BlueskyCredentials(string Identifier, string AppPassword);

/// <summary>The resolved session identity: stable DID plus current handle.</summary>
public sealed record BlueskyIdentity(string Did, string Handle);

/// <summary>
/// Typed outcome of an attempted Bluesky session open. Account-caused refusals are
/// distinguished from transient unavailability so the domain layer can store nothing on
/// refusal while leaving retry/backoff policy to jobs infrastructure later. Reasons are
/// provider-classified, sanitised phrases — never raw provider payloads, never
/// credentials.
/// </summary>
public abstract record BlueskySessionResult {
	/// <summary>Session opened; <see cref="BlueskyIdentity"/> carries DID + handle.</summary>
	public sealed record Success(BlueskyIdentity Identity) : BlueskySessionResult;

	/// <summary>Bluesky refused these credentials/identifier (401/400-class). Nothing
	/// about the account changed server-side; the caller must not persist anything.</summary>
	public sealed record AccountFailure(string Reason) : BlueskySessionResult;

	/// <summary>Network failure, timeout, or Bluesky-side 5xx. Not an account problem;
	/// retry with backoff belongs to the jobs infrastructure, not to this call.</summary>
	public sealed record Transient() : BlueskySessionResult;
}

/// <summary>
/// Minimal Bluesky client seam (Epic C §6 item 2): opens an AT Protocol session with an
/// app password (<c>com.atproto.server.createSession</c>) and resolves DID + handle.
/// Faked in every spec — never the real network.
/// </summary>
public interface IBlueskyClient {
	Task<BlueskySessionResult> CreateSessionAsync(
		BlueskyCredentials credentials,
		CancellationToken cancellationToken = default
	);
}
