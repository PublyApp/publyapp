using PublyApp.Api.Modules.Publishing.Providers.Capabilities;
using PublyApp.Api.Modules.SocialAccounts.Entities;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Mastodon;

/// <summary>
/// The Mastodon REST calls the connect flow needs (#2174). Failures are typed,
/// never thrown: a 4xx is a <see cref="MastodonResult{T}.Refused"/> with a short
/// cause, anything else (transport, timeout, 5xx, bad payload) is
/// <see cref="MastodonResult{T}.Unreachable"/>. Secrets are never part of a cause.
/// </summary>
public interface IMastodonClient {
	Task<MastodonResult<MastodonApp>> RegisterAppAsync(
		string host, string redirectUri, string scopes, CancellationToken cancellationToken
	);

	/// <summary>
	/// Exchanges the authorization code for an access token. <paramref name="codeVerifier"/> is the
	/// PKCE verifier (RFC 7636) of a flow that sent a challenge; null for a flow that did not.
	/// </summary>
	Task<MastodonResult<string>> ExchangeCodeAsync(
		string host,
		MastodonApp app,
		string redirectUri,
		string code,
		string? codeVerifier,
		CancellationToken cancellationToken
	);

	/// <summary>
	/// Whether the instance advertises PKCE with the S256 method in its OAuth server metadata
	/// (<c>/.well-known/oauth-authorization-server</c>, Mastodon 4.3+). Any failure, a missing
	/// document or a missing method is false: that instance connects without PKCE (#2186).
	/// </summary>
	Task<bool> SupportsPkceAsync(string host, CancellationToken cancellationToken);

	Task<MastodonResult<MastodonAccountInfo>> VerifyCredentialsAsync(
		string host, string accessToken, CancellationToken cancellationToken
	);

	/// <summary>The instance's advertised limits, or null when it advertises none.</summary>
	Task<MastodonInstanceLimits?> GetInstanceLimitsAsync(string host, CancellationToken cancellationToken);

	/// <summary>Best effort: any failure is swallowed.</summary>
	Task RevokeAsync(
		string host, MastodonApp app, string accessToken, CancellationToken cancellationToken
	);
}

public abstract record MastodonResult<T> {
	public sealed record Ok(T Value) : MastodonResult<T>;

	public sealed record Refused(string Reason) : MastodonResult<T>;

	public sealed record Unreachable() : MastodonResult<T>;
}

public sealed record MastodonApp(string ClientId, string ClientSecret);

/// <summary>The numeric account id is the stable identity; acct can change.</summary>
public sealed record MastodonAccountInfo(string Id, string Acct);

public sealed record MastodonInstanceLimits(
	long? MaxCharacters,
	long? MaxMediaAttachments,
	long? CharactersReservedPerUrl,
	long? ImageSizeLimit,
	IReadOnlyList<string>? SupportedMimeTypes
) {
	/// <summary>
	/// The capability overrides JSON these limits translate to for one network, or null when
	/// nothing usable was advertised. The one translation shared by connect and the daily refresh.
	/// </summary>
	public string? ToCapabilityOverrides(SocialProvider provider) {
		return CapabilityOverridesFactory.ForMastodon(
			this.MaxCharacters,
			this.MaxMediaAttachments,
			this.CharactersReservedPerUrl,
			this.ImageSizeLimit,
			this.SupportedMimeTypes,
			provider
		);
	}
}
