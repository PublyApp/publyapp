using System.Text;

using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Adapters;

/// <summary>
/// The connect half of a social adapter: open (or re-verify) one live session from the
/// credential the connect flow already resolved. A network that only publishes (Discord
/// webhooks) does not implement this port at all.
/// </summary>
public interface ISocialConnector {
	/// <summary>Every network this adapter serves (Mastodon serves Mastodon and Pixelfed).</summary>
	IReadOnlySet<SocialProvider> Networks { get; }

	Task<SocialSessionResult> ConnectAsync(
		SocialConnectRequest request,
		CancellationToken cancellationToken
	);
}

/// <summary>
/// The credential material one connect call needs. <see cref="Credential"/> is an access
/// token (Mastodon/Pixelfed) or an app password (Bluesky); it is rendered as
/// <c>[REDACTED]</c> so no logging path can leak it.
/// </summary>
public sealed record SocialConnectRequest {
	public required SocialProvider Network { get; init; }

	/// <summary>Mastodon/Pixelfed instance host; unused by Bluesky.</summary>
	public string Host { get; init; } = string.Empty;

	/// <summary>Bluesky handle/identifier; unused by Mastodon/Pixelfed.</summary>
	public string Identifier { get; init; } = string.Empty;

	public required string Credential { get; init; }

	public sealed override string ToString() {
		var builder = new StringBuilder();
		builder.Append(nameof(SocialConnectRequest));
		builder.Append(" { ");
		builder.Append(nameof(this.Network));
		builder.Append(" = ");
		builder.Append(this.Network);
		builder.Append(", ");
		builder.Append(nameof(this.Host));
		builder.Append(" = ");
		builder.Append(this.Host);
		builder.Append(", ");
		builder.Append(nameof(this.Identifier));
		builder.Append(" = ");
		builder.Append(this.Identifier);
		builder.Append(", ");
		builder.Append(nameof(this.Credential));
		builder.Append(" = ");
		builder.Append("[REDACTED]");
		builder.Append(' ');
		builder.Append('}');
		return builder.ToString();
	}
}
