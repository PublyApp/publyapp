using PublyApp.Api.Modules.SocialAccounts.Providers.Mastodon;

namespace PublyApp.Api.Lib.Testing.Fakes;

/// <summary>
/// Recording fake of the Mastodon REST client (#2174, #2186): no network, every call is
/// appended to <see cref="Calls"/> and every answer is settable. Shared by the connect-flow
/// service spec and the HTTP specs that swap it into the host.
/// </summary>
public sealed class FakeMastodonClient : IMastodonClient {
	public System.Collections.Concurrent.ConcurrentQueue<string> Calls { get; } = new();

	// Widens the window between "decide to register" and "registered" so a race is reproducible.
	public TimeSpan RegisterDelay { get; set; }

	// Lets a spec hold one registration open (or cancel it midway) while it checks what else proceeds.
	public Func<string, CancellationToken, Task>? OnRegister { get; set; }

	public MastodonAccountInfo Account { get; set; } = new("109", "alice");

	public MastodonInstanceLimits? Limits { get; set; }

	public string Token { get; set; } = "access-token-1";

	public MastodonResult<string>? TokenResult { get; set; }

	// When set, each registration gets its own client id (to tell two apps apart).
	public bool UniqueClients { get; set; }

	// When set, every registration answers with this instead of a new app.
	public MastodonResult<MastodonApp>? RegisterResult { get; set; }

	public string? LastExchangeClientId { get; private set; }

	// Whether the fake instance advertises PKCE S256; false models an older Mastodon / Pixelfed.
	public bool SupportsPkce { get; set; }

	public string? LastExchangeVerifier { get; private set; }

	public async Task<MastodonResult<MastodonApp>> RegisterAppAsync(string host, string redirectUri, string scopes, CancellationToken cancellationToken) {
		this.Calls.Enqueue($"register {host}");
		if (this.OnRegister is not null) {
			await this.OnRegister(host, cancellationToken);
		}

		if (this.RegisterDelay > TimeSpan.Zero) {
			await Task.Delay(this.RegisterDelay, cancellationToken);
		}

		var clientId = this.UniqueClients ? $"client-{scopes.Replace(' ', '-')}" : "client-id";
		return this.RegisterResult ?? new MastodonResult<MastodonApp>.Ok(new MastodonApp(clientId, "client-secret"));
	}

	public Task<bool> SupportsPkceAsync(string host, CancellationToken cancellationToken) {
		this.Calls.Enqueue($"pkce {host}");
		return Task.FromResult(this.SupportsPkce);
	}

	public Task<MastodonResult<string>> ExchangeCodeAsync(string host, MastodonApp app, string redirectUri, string code, string? codeVerifier, CancellationToken cancellationToken) {
		this.Calls.Enqueue($"exchange {host}");
		this.LastExchangeClientId = app.ClientId;
		this.LastExchangeVerifier = codeVerifier;
		return Task.FromResult(this.TokenResult ?? new MastodonResult<string>.Ok(this.Token));
	}

	public Task<MastodonResult<MastodonAccountInfo>> VerifyCredentialsAsync(string host, string accessToken, CancellationToken cancellationToken) {
		this.Calls.Enqueue($"verify {host}");
		return Task.FromResult<MastodonResult<MastodonAccountInfo>>(new MastodonResult<MastodonAccountInfo>.Ok(this.Account));
	}

	public Task<MastodonInstanceLimits?> GetInstanceLimitsAsync(string host, CancellationToken cancellationToken) {
		this.Calls.Enqueue($"limits {host}");
		return Task.FromResult(this.Limits);
	}

	public Exception? RevokeFailure { get; set; }

	public Task RevokeAsync(string host, MastodonApp app, string accessToken, CancellationToken cancellationToken) {
		if (this.RevokeFailure is not null) {
			throw this.RevokeFailure;
		}

		this.Calls.Enqueue($"revoke {host} {accessToken} {app.ClientSecret}");
		return Task.CompletedTask;
	}
}
