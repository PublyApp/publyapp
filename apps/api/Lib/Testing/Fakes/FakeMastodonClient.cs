using PublyApp.Api.Modules.SocialAccounts.Providers.Mastodon;

namespace PublyApp.Api.Lib.Testing.Fakes;

/// <summary>
/// Recording fake of the Mastodon REST client (#2174, #2186): no network, every call is
/// appended to <see cref="Calls"/> and every answer is settable. Shared by the connect-flow
/// service spec and the HTTP specs that swap it into the host.
/// </summary>
public sealed class FakeMastodonClient : IMastodonClient {
	public List<string> Calls { get; } = [];

	public MastodonAccountInfo Account { get; set; } = new("109", "alice");

	public MastodonInstanceLimits? Limits { get; set; }

	public string Token { get; set; } = "access-token-1";

	public MastodonResult<string>? TokenResult { get; set; }

	// When set, each registration gets its own client id (to tell two apps apart).
	public bool UniqueClients { get; set; }

	public string? LastExchangeClientId { get; private set; }

	// Whether the fake instance advertises PKCE S256; false models an older Mastodon / Pixelfed.
	public bool SupportsPkce { get; set; }

	public string? LastExchangeVerifier { get; private set; }

	public Task<MastodonResult<MastodonApp>> RegisterAppAsync(string host, string redirectUri, string scopes, CancellationToken cancellationToken) {
		this.Calls.Add($"register {host}");
		var clientId = this.UniqueClients ? $"client-{scopes.Replace(' ', '-')}" : "client-id";
		return Task.FromResult<MastodonResult<MastodonApp>>(new MastodonResult<MastodonApp>.Ok(new MastodonApp(clientId, "client-secret")));
	}

	public Task<bool> SupportsPkceAsync(string host, CancellationToken cancellationToken) {
		this.Calls.Add($"pkce {host}");
		return Task.FromResult(this.SupportsPkce);
	}

	public Task<MastodonResult<string>> ExchangeCodeAsync(string host, MastodonApp app, string redirectUri, string code, string? codeVerifier, CancellationToken cancellationToken) {
		this.Calls.Add($"exchange {host}");
		this.LastExchangeClientId = app.ClientId;
		this.LastExchangeVerifier = codeVerifier;
		return Task.FromResult(this.TokenResult ?? new MastodonResult<string>.Ok(this.Token));
	}

	public Task<MastodonResult<MastodonAccountInfo>> VerifyCredentialsAsync(string host, string accessToken, CancellationToken cancellationToken) {
		this.Calls.Add($"verify {host}");
		return Task.FromResult<MastodonResult<MastodonAccountInfo>>(new MastodonResult<MastodonAccountInfo>.Ok(this.Account));
	}

	public Task<MastodonInstanceLimits?> GetInstanceLimitsAsync(string host, CancellationToken cancellationToken) {
		this.Calls.Add($"limits {host}");
		return Task.FromResult(this.Limits);
	}

	public Exception? RevokeFailure { get; set; }

	public Task RevokeAsync(string host, MastodonApp app, string accessToken, CancellationToken cancellationToken) {
		if (this.RevokeFailure is not null) {
			throw this.RevokeFailure;
		}

		this.Calls.Add($"revoke {host} {accessToken} {app.ClientSecret}");
		return Task.CompletedTask;
	}
}
