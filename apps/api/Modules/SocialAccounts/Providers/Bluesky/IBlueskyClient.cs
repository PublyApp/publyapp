using System.Text;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Bluesky;

/// <summary>
/// Credentials presented to a Bluesky session open (Epic C §1 decision 3: app password
/// now, OAuth later). The app password is write-only from this seam's point of view: it
/// travels inside the session-open request and must never be logged, returned, or
/// persisted in cleartext anywhere (Epic C §4). <see cref="ToString"/> and
/// <see cref="PrintMembers"/> render <see cref="AppPassword"/> as <c>[REDACTED]</c> so
/// no logging path can leak it — positional records otherwise synthesize a ToString()
/// that prints every property. Request-body serialization still carries the real value
/// (the PDS requires it); direct property access stays available to the client seam.
/// </summary>
public sealed record BlueskyCredentials(string Identifier, string AppPassword) {
	public sealed override string ToString() {
		var builder = new StringBuilder();
		builder.Append(nameof(BlueskyCredentials));
		builder.Append(" { ");
		PrintMembers(builder);
		builder.Append(' ');
		builder.Append('}');
		return builder.ToString();
	}

	private bool PrintMembers(StringBuilder builder) {
		builder.Append(nameof(Identifier));
		builder.Append(" = ");
		builder.Append(Identifier);
		builder.Append(", ");
		builder.Append(nameof(AppPassword));
		builder.Append(" = ");
		builder.Append("[REDACTED]");
		return true;
	}
}

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
	/// <summary>
	/// Session opened; <see cref="Identity"/> carries DID + handle, and the
	/// short-lived access token plus PDS host travel only inside this result —
	/// they are consumed by the session provider and never stored or returned.
	/// </summary>
	public sealed record Success(
		BlueskyIdentity Identity,
		string AccessJwt,
		string PdsHost
	) : BlueskySessionResult;

	/// <summary>Bluesky refused these credentials/identifier (401/400-class). The caller
	/// (session provider) treats this as an account-caused problem: the stored row flips
	/// to NeedsReconnect with the sanitised reason persisted as its cause.</summary>
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
