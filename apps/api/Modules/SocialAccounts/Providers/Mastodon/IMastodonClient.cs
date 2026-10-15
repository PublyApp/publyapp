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

	Task<MastodonResult<string>> ExchangeCodeAsync(
		string host, MastodonApp app, string redirectUri, string code, CancellationToken cancellationToken
	);

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
);
