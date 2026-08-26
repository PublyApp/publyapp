using System.Text;
using System.Text.Json.Serialization;

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

/// <summary>
/// A live provider session: identity plus the short-lived access token. Positional
/// records synthesize a <see cref="ToString"/> that prints every property, so
/// <see cref="AccessJwt"/> is rendered as <c>[REDACTED]</c> here and in
/// <see cref="PrintMembers"/>, and is ignored by JSON serializers (what structured log
/// sinks emit). Direct property access stays available to the Epic D consumer; the D1
/// positional construction <c>SocialSession(Did, Handle, AccessJwt, PdsHost)</c> is
/// unchanged.
/// </summary>
public sealed record SocialSession(
	string Did,
	string Handle,
	[property: JsonIgnore] string AccessJwt,
	string PdsHost
) {
	public sealed override string ToString() {
		var builder = new StringBuilder();
		builder.Append(nameof(SocialSession));
		builder.Append(" { ");
		PrintMembers(builder);
		builder.Append(' ');
		builder.Append('}');
		return builder.ToString();
	}

	private bool PrintMembers(StringBuilder builder) {
		builder.Append(nameof(Did));
		builder.Append(" = ");
		builder.Append(Did);
		builder.Append(", ");
		builder.Append(nameof(Handle));
		builder.Append(" = ");
		builder.Append(Handle);
		builder.Append(", ");
		builder.Append(nameof(AccessJwt));
		builder.Append(" = ");
		builder.Append("[REDACTED]");
		builder.Append(", ");
		builder.Append(nameof(PdsHost));
		builder.Append(" = ");
		builder.Append(PdsHost);
		return true;
	}
}

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
