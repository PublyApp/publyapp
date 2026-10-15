using System.Security.Cryptography;
using System.Text;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Publishing.Providers.Capabilities;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Mastodon;

/// <summary>A token revoke prepared while the credentials still exist.</summary>
public sealed record MastodonRevocation(string Host, MastodonApp App, string AccessToken) {
	public sealed override string ToString() {
		return $"MastodonRevocation {{ Host = {this.Host} }}";
	}
}

public abstract record StartMastodonConnectResult {
	public sealed record Started(string AuthorizeUrl) : StartMastodonConnectResult;

	public sealed record InvalidInstance() : StartMastodonConnectResult;

	public sealed record Refused(string Reason) : StartMastodonConnectResult;

	public sealed record Unreachable() : StartMastodonConnectResult;
}

public abstract record CompleteMastodonConnectResult {
	/// <summary><paramref name="WasKnown"/>: the account already existed (a reconnect).</summary>
	public sealed record Connected(SocialAccount Account, bool WasKnown) : CompleteMastodonConnectResult;

	/// <summary>Unknown, expired, foreign or already-used state; nothing was stored.</summary>
	public sealed record InvalidState() : CompleteMastodonConnectResult;

	public sealed record Refused(string Reason) : CompleteMastodonConnectResult;

	public sealed record Unreachable() : CompleteMastodonConnectResult;
}

/// <summary>
/// Mastodon's per-instance OAuth connect flow (#2174): start (register the app
/// once per host, mint a single-use state, build the authorize URL) and complete
/// (consume the state, exchange the code, verify the account, read the instance's
/// limits, store the encrypted token). The callback lands on the front (the
/// redirect URI is under <c>FRONT_URL</c>), which calls complete with the user's
/// own session, so the state is bound to tenant AND user without an anonymous route.
/// Registered manually (not a <c>[Service]</c>): it is a flow, not a domain service.
/// </summary>
public sealed class MastodonOAuthService {
	public const string Scopes = "read:accounts write:statuses write:media";
	public const string CallbackPath = "/tenant/settings/integrations";

	private static readonly TimeSpan _StateLifetime = TimeSpan.FromMinutes(10);

	private readonly AppDbContext _Db;
	private readonly ICredentialProtector _Protector;
	private readonly IMastodonClient _Client;
	private readonly string _FrontUrl;

	public MastodonOAuthService(
		AppDbContext db,
		ICredentialProtector protector,
		IMastodonClient client
	) {
		this._Db = db;
		this._Protector = protector;
		this._Client = client;
		this._FrontUrl = AppEnvironment.Instance.FRONT_URL.TrimEnd('/');
	}

	public string RedirectUri {
		get { return this._FrontUrl + MastodonOAuthService.CallbackPath; }
	}

	public async Task<StartMastodonConnectResult> StartAsync(
		Guid tenantId,
		Guid userId,
		string rawInstance,
		CancellationToken cancellationToken
	) {
		var host = MastodonHostGuard.NormalizeHost(rawInstance);
		if (host is null) {
			return new StartMastodonConnectResult.InvalidInstance();
		}

		var app = await this._FindOrRegisterAppAsync(host, cancellationToken);
		if (app is MastodonResult<MastodonApp>.Refused refused) {
			return new StartMastodonConnectResult.Refused(refused.Reason);
		}

		if (app is not MastodonResult<MastodonApp>.Ok registered) {
			return new StartMastodonConnectResult.Unreachable();
		}

		// Pending flows older than a day are dead weight; sweep them opportunistically.
		var cutoff = DateTime.UtcNow.AddDays(-1);
		await this._Db.OAuthState
			.Where(state => state.TenantId == tenantId && state.ExpiresAt < cutoff)
			.ExecuteDeleteAsync(cancellationToken);

		var state = MastodonOAuthService._Base64Url(RandomNumberGenerator.GetBytes(32));
		await this._Db.OAuthState.AddAsync(new OAuthState {
			TenantId = tenantId,
			UserId = userId,
			StateHash = MastodonOAuthService.Hash(state),
			InstanceHost = host,
			ExpiresAt = DateTime.UtcNow.Add(MastodonOAuthService._StateLifetime),
		}, cancellationToken);
		await this._Db.SaveChangesAsync(cancellationToken);

		var query = string.Join("&", new Dictionary<string, string> {
			["response_type"] = "code",
			["client_id"] = registered.Value.ClientId,
			["redirect_uri"] = this.RedirectUri,
			["scope"] = MastodonOAuthService.Scopes,
			["state"] = state,
		}.Select(pair => $"{pair.Key}={Uri.EscapeDataString(pair.Value)}"));
		return new StartMastodonConnectResult.Started($"https://{host}/oauth/authorize?{query}");
	}

	public async Task<CompleteMastodonConnectResult> CompleteAsync(
		Guid tenantId,
		Guid userId,
		string code,
		string state,
		CancellationToken cancellationToken
	) {
		var hash = MastodonOAuthService.Hash(state);
		var now = DateTime.UtcNow;
		var pending = await this._Db.OAuthState
			.AsNoTracking()
			.Where(row => row.StateHash == hash
				&& row.TenantId == tenantId
				&& row.UserId == userId
				&& row.ConsumedAt == null
				&& row.ExpiresAt > now)
			.Select(row => new { row.Id, row.InstanceHost })
			.FirstOrDefaultAsync(cancellationToken);
		if (pending is null) {
			return new CompleteMastodonConnectResult.InvalidState();
		}

		// Single use: the conditional update is the lock; the loser of a race gets 0 rows.
		var consumed = await this._Db.OAuthState
			.Where(row => row.Id == pending.Id && row.ConsumedAt == null)
			.ExecuteUpdateAsync(
				setters => setters.SetProperty(row => row.ConsumedAt, now),
				cancellationToken
			);
		if (consumed != 1) {
			return new CompleteMastodonConnectResult.InvalidState();
		}

		var host = pending.InstanceHost;
		var registration = await this._Db.OAuthAppRegistration
			.AsNoTracking()
			.FirstOrDefaultAsync(row => row.Host == host && !row.IsDeleted, cancellationToken);
		var secret = this._ClientSecret(registration?.ProtectedClientSecret);
		if (registration is null || secret is null) {
			return new CompleteMastodonConnectResult.InvalidState();
		}

		var app = new MastodonApp(registration.ClientId, secret);
		var token = await this._Client.ExchangeCodeAsync(host, app, this.RedirectUri, code, cancellationToken);
		if (token is MastodonResult<string>.Refused refusedToken) {
			return new CompleteMastodonConnectResult.Refused(refusedToken.Reason);
		}

		if (token is not MastodonResult<string>.Ok accessToken) {
			return new CompleteMastodonConnectResult.Unreachable();
		}

		var identity = await this._Client.VerifyCredentialsAsync(host, accessToken.Value, cancellationToken);
		if (identity is MastodonResult<MastodonAccountInfo>.Refused refusedIdentity) {
			return new CompleteMastodonConnectResult.Refused(refusedIdentity.Reason);
		}

		if (identity is not MastodonResult<MastodonAccountInfo>.Ok account) {
			return new CompleteMastodonConnectResult.Unreachable();
		}

		var limits = await this._Client.GetInstanceLimitsAsync(host, cancellationToken);
		var overrides = limits is null
			? null
			: CapabilityOverridesFactory.ForMastodon(
				limits.MaxCharacters,
				limits.MaxMediaAttachments,
				limits.CharactersReservedPerUrl,
				limits.ImageSizeLimit,
				limits.SupportedMimeTypes
			);

		return await this._StoreAccountAsync(
			tenantId, host, account.Value, accessToken.Value, overrides, cancellationToken
		);
	}

	/// <summary>
	/// Everything a revoke needs, captured BEFORE the stored credentials are erased
	/// (null when the account is not a usable Mastodon account).
	/// </summary>
	public async Task<MastodonRevocation?> PrepareRevocationAsync(
		Guid tenantId,
		Guid socialAccountId,
		CancellationToken cancellationToken
	) {
		var stored = await this._Db.SocialAccount
			.AsNoTracking()
			.Where(account => account.Id == socialAccountId
				&& account.TenantId == tenantId
				&& account.Provider == SocialProvider.Mastodon
				&& !account.IsDeleted)
			.Select(account => account.ProtectedCredentials)
			.FirstOrDefaultAsync(cancellationToken);
		var credentials = MastodonCredentials.Unprotect(this._Protector, stored);
		if (credentials is null) {
			return null;
		}

		var registration = await this._Db.OAuthAppRegistration
			.AsNoTracking()
			.FirstOrDefaultAsync(row => row.Host == credentials.Host && !row.IsDeleted, cancellationToken);
		var secret = this._ClientSecret(registration?.ProtectedClientSecret);
		if (registration is null || secret is null) {
			return null;
		}

		return new MastodonRevocation(
			credentials.Host, new MastodonApp(registration.ClientId, secret), credentials.AccessToken
		);
	}

	/// <summary>
	/// Revokes the token on the instance, best effort and bounded (5 s): a dead
	/// instance never delays or fails a disconnect.
	/// </summary>
	public async Task RevokeBestEffortAsync(MastodonRevocation? revocation, CancellationToken cancellationToken) {
		if (revocation is null) {
			return;
		}

		using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
		timeout.CancelAfter(TimeSpan.FromSeconds(5));
		try {
			await this._Client.RevokeAsync(revocation.Host, revocation.App, revocation.AccessToken, timeout.Token);
		} catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) {
			// Timed out: the account is already disconnected locally.
		} catch (HttpRequestException) {
			// Unreachable instance: nothing more to do.
		}
	}

	private async Task<MastodonResult<MastodonApp>> _FindOrRegisterAppAsync(
		string host,
		CancellationToken cancellationToken
	) {
		var existing = await this._Db.OAuthAppRegistration
			.FirstOrDefaultAsync(row => row.Host == host && !row.IsDeleted, cancellationToken);
		if (existing is not null && existing.RedirectUri == this.RedirectUri && existing.Scopes == MastodonOAuthService.Scopes) {
			var secret = this._Protector.Unprotect(existing.ProtectedClientSecret, SocialProvider.Mastodon);
			if (secret.Plaintext is not null) {
				return new MastodonResult<MastodonApp>.Ok(new MastodonApp(existing.ClientId, secret.Plaintext));
			}
		}

		var registered = await this._Client.RegisterAppAsync(
			host, this.RedirectUri, MastodonOAuthService.Scopes, cancellationToken
		);
		if (registered is not MastodonResult<MastodonApp>.Ok ok) {
			return registered;
		}

		var protectedSecret = this._Protector.Protect(ok.Value.ClientSecret, SocialProvider.Mastodon);
		if (existing is not null) {
			// Stale (redirect or scopes changed) or unreadable: replace in place.
			existing.ClientId = ok.Value.ClientId;
			existing.ProtectedClientSecret = protectedSecret;
			existing.RedirectUri = this.RedirectUri;
			existing.Scopes = MastodonOAuthService.Scopes;
		} else {
			await this._Db.OAuthAppRegistration.AddAsync(new OAuthAppRegistration {
				Host = host,
				ClientId = ok.Value.ClientId,
				ProtectedClientSecret = protectedSecret,
				Scopes = MastodonOAuthService.Scopes,
				RedirectUri = this.RedirectUri,
			}, cancellationToken);
		}

		try {
			await this._Db.SaveChangesAsync(cancellationToken);
		} catch (DbUpdateException) {
			// A concurrent first registration won the unique index: use its row.
			this._Db.ChangeTracker.Clear();
			var winner = await this._Db.OAuthAppRegistration
				.AsNoTracking()
				.FirstOrDefaultAsync(row => row.Host == host && !row.IsDeleted, cancellationToken);
			var winnerSecret = this._ClientSecret(winner?.ProtectedClientSecret);
			if (winner is null || winnerSecret is null) {
				return new MastodonResult<MastodonApp>.Unreachable();
			}

			return new MastodonResult<MastodonApp>.Ok(new MastodonApp(winner.ClientId, winnerSecret));
		}

		return ok;
	}

	private async Task<CompleteMastodonConnectResult> _StoreAccountAsync(
		Guid tenantId,
		string host,
		MastodonAccountInfo identity,
		string accessToken,
		string? overrides,
		CancellationToken cancellationToken
	) {
		var externalId = $"{identity.Id}@{host}";
		var handle = $"{identity.Acct}@{host}";
		var protectedCredentials = new MastodonCredentials(host, accessToken).Protect(this._Protector);
		var existing = await this._Db.SocialAccount.FirstOrDefaultAsync(
			account => account.TenantId == tenantId
				&& account.Provider == SocialProvider.Mastodon
				&& account.ExternalAccountId == externalId
				&& !account.IsDeleted,
			cancellationToken
		);

		var account = existing ?? new SocialAccount {
			TenantId = tenantId,
			Provider = SocialProvider.Mastodon,
			ExternalAccountId = externalId,
			DisplayHandle = handle,
			ProtectedCredentials = protectedCredentials,
		};
		account.DisplayHandle = handle;
		account.CredentialType = SocialCredentialType.OAuth;
		account.ProtectedCredentials = protectedCredentials;
		account.Status = SocialAccountStatus.Active;
		account.LastError = null;
		account.LastSuccessAt = DateTime.UtcNow;
		// A reconnect refreshes the limits; an instance that advertises nothing
		// keeps the last known values (never silently reverts to defaults).
		if (overrides is not null) {
			account.CapabilityOverrides = overrides;
			account.CapabilityRefreshedAt = DateTime.UtcNow;
		}

		if (existing is null) {
			await this._Db.SocialAccount.AddAsync(account, cancellationToken);
		}

		await this._Db.SaveChangesAsync(cancellationToken);
		return new CompleteMastodonConnectResult.Connected(account, existing is not null);
	}

	private string? _ClientSecret(string? protectedSecret) {
		return this._Protector.Unprotect(protectedSecret, SocialProvider.Mastodon).Plaintext;
	}

	internal static string Hash(string state) {
		return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(state)));
	}

	private static string _Base64Url(byte[] bytes) {
		return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
	}
}
