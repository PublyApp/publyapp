using System.Security.Cryptography;
using System.Text;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
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

	/// <summary>The tenant registered PublyApp on too many new servers recently (#2186).</summary>
	public sealed record QuotaExceeded() : StartMastodonConnectResult;

	/// <summary>The account to reconnect is not one of this tenant's accounts on that network.</summary>
	public sealed record ReconnectTargetNotFound() : StartMastodonConnectResult;
}

public abstract record CompleteMastodonConnectResult {
	/// <summary><paramref name="WasKnown"/>: the account already existed (a reconnect).</summary>
	public sealed record Connected(SocialAccount Account, bool WasKnown) : CompleteMastodonConnectResult;

	/// <summary>Unknown, expired, foreign or already-used state; nothing was stored.</summary>
	public sealed record InvalidState() : CompleteMastodonConnectResult;

	public sealed record Refused(string Reason) : CompleteMastodonConnectResult;

	public sealed record Unreachable() : CompleteMastodonConnectResult;

	/// <summary>
	/// A reconnect came back signed in as a different account than the one being reconnected.
	/// Nothing was stored, the new token was revoked and the old account is untouched (#2186).
	/// </summary>
	public sealed record AccountMismatch(
		string ExpectedHandle,
		string ActualHandle,
		SocialProvider Provider,
		string Host
	) : CompleteMastodonConnectResult;
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
	// Pixelfed only knows the coarse OAuth scopes.
	public const string PixelfedScopes = "read write";
	public const string CallbackPath = "/tenant/settings/integrations";

	/// <summary>
	/// How many NEW servers one tenant may register PublyApp on per rolling window (#2186, L6).
	/// Registering is a write on a stranger's server triggered by any signed-in user, and the row
	/// is shared by every tenant, so without a cap one account could make PublyApp register on
	/// arbitrarily many hosts. Five covers a person who connects a few fediverse accounts in a
	/// day; reconnecting or connecting on a server another tenant already registered costs
	/// nothing, and the window slides, so a tenant is never locked out for good.
	/// </summary>
	public const int MaxNewHostRegistrationsPerTenant = 5;

	public static readonly TimeSpan NewHostRegistrationWindow = TimeSpan.FromHours(24);

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

	private static string _ScopesFor(SocialProvider provider) {
		return provider == SocialProvider.Pixelfed
			? MastodonOAuthService.PixelfedScopes
			: MastodonOAuthService.Scopes;
	}

	public async Task<StartMastodonConnectResult> StartAsync(
		Guid tenantId,
		Guid userId,
		string rawInstance,
		CancellationToken cancellationToken,
		SocialProvider provider = SocialProvider.Mastodon,
		Guid? reconnectAccountId = null
	) {
		var host = MastodonHostGuard.NormalizeHost(rawInstance);
		if (host is null) {
			return new StartMastodonConnectResult.InvalidInstance();
		}

		if (reconnectAccountId is { } target) {
			var known = await this._Db.SocialAccount
				.AsNoTracking()
				.AnyAsync(
					account => account.Id == target
						&& account.TenantId == tenantId
						&& account.Provider == provider
						&& !account.IsDeleted
						&& account.ExternalAccountId.EndsWith("@" + host),
					cancellationToken
				);
			if (!known) {
				return new StartMastodonConnectResult.ReconnectTargetNotFound();
			}
		}

		var scopes = MastodonOAuthService._ScopesFor(provider);
		var (app, quotaExceeded) = await this._FindOrRegisterAppAsync(
			tenantId, host, provider, scopes, cancellationToken
		);
		if (quotaExceeded) {
			return new StartMastodonConnectResult.QuotaExceeded();
		}

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

		// PKCE (RFC 7636, S256) when the instance advertises it; an instance that does not
		// (older Mastodon, Pixelfed) connects exactly as before, with the stored client secret.
		var verifier = await this._Client.SupportsPkceAsync(host, cancellationToken)
			? MastodonOAuthService._Base64Url(RandomNumberGenerator.GetBytes(32))
			: null;

		var state = MastodonOAuthService._Base64Url(RandomNumberGenerator.GetBytes(32));
		await this._Db.OAuthState.AddAsync(new OAuthState {
			TenantId = tenantId,
			UserId = userId,
			StateHash = MastodonOAuthService.Hash(state),
			Provider = provider,
			InstanceHost = host,
			ProtectedCodeVerifier = verifier is null
				? null
				: this._Protector.Protect(verifier, SocialProvider.Mastodon),
			ReconnectSocialAccountId = reconnectAccountId,
			ExpiresAt = DateTime.UtcNow.Add(MastodonOAuthService._StateLifetime),
		}, cancellationToken);
		await this._Db.SaveChangesAsync(cancellationToken);

		var parameters = new Dictionary<string, string> {
			["response_type"] = "code",
			["client_id"] = registered.Value.ClientId,
			["redirect_uri"] = this.RedirectUri,
			["scope"] = scopes,
			["state"] = state,
		};
		if (verifier is not null) {
			parameters["code_challenge"] = MastodonOAuthService._Base64Url(
				SHA256.HashData(Encoding.ASCII.GetBytes(verifier))
			);
			parameters["code_challenge_method"] = "S256";
		}

		var query = string.Join("&", parameters.Select(pair => $"{pair.Key}={Uri.EscapeDataString(pair.Value)}"));
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
			.Select(row => new {
				row.Id,
				row.InstanceHost,
				row.Provider,
				row.ProtectedCodeVerifier,
				row.ReconnectSocialAccountId,
			})
			.FirstOrDefaultAsync(cancellationToken);
		if (pending is null) {
			return new CompleteMastodonConnectResult.InvalidState();
		}

		// Single use: the conditional update is the lock; the loser of a race gets 0 rows.
		var consumed = await this._Db.OAuthState
			.Where(row => row.Id == pending.Id && row.ConsumedAt == null)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(row => row.ConsumedAt, now)
					.SetProperty(row => row.ProtectedCodeVerifier, (string?)null),
				cancellationToken
			);
		if (consumed != 1) {
			return new CompleteMastodonConnectResult.InvalidState();
		}

		var host = pending.InstanceHost;
		var registration = await this._Db.OAuthAppRegistration
			.AsNoTracking()
			.FirstOrDefaultAsync(
				row => row.Host == host && row.Provider == pending.Provider && !row.IsDeleted,
				cancellationToken
			);
		var secret = this._ClientSecret(registration?.ProtectedClientSecret);
		if (registration is null || secret is null) {
			return new CompleteMastodonConnectResult.InvalidState();
		}

		string? verifier = null;
		if (pending.ProtectedCodeVerifier is not null) {
			verifier = this._Protector.Unprotect(pending.ProtectedCodeVerifier, SocialProvider.Mastodon).Plaintext;
			if (verifier is null) {
				// The instance holds the challenge: without the verifier no exchange can succeed.
				return new CompleteMastodonConnectResult.InvalidState();
			}
		}

		var app = new MastodonApp(registration.ClientId, secret);
		var token = await this._Client.ExchangeCodeAsync(
			host, app, this.RedirectUri, code, verifier, cancellationToken
		);
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

		if (pending.ReconnectSocialAccountId is { } reconnecting) {
			var expected = await this._Db.SocialAccount
				.AsNoTracking()
				.Where(row => row.Id == reconnecting && row.TenantId == tenantId && !row.IsDeleted)
				.Select(row => new { row.ExternalAccountId, row.DisplayHandle })
				.FirstOrDefaultAsync(cancellationToken);
			if (expected is not null && expected.ExternalAccountId != $"{account.Value.Id}@{host}") {
				// A different account signed in: never link it silently, and never leave its
				// token behind. The account being reconnected stays exactly as it was.
				await this.RevokeBestEffortAsync(
					new MastodonRevocation(host, app, accessToken.Value), cancellationToken
				);
				return new CompleteMastodonConnectResult.AccountMismatch(
					expected.DisplayHandle, $"{account.Value.Acct}@{host}", pending.Provider, host
				);
			}
		}

		var limits = await this._Client.GetInstanceLimitsAsync(host, cancellationToken);
		var overrides = limits?.ToCapabilityOverrides(pending.Provider);

		return await this._StoreAccountAsync(
			tenantId, pending.Provider, host, account.Value, accessToken.Value, overrides, cancellationToken
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
				&& (account.Provider == SocialProvider.Mastodon || account.Provider == SocialProvider.Pixelfed)
				&& !account.IsDeleted)
			.Select(account => new { account.Provider, account.ProtectedCredentials })
			.FirstOrDefaultAsync(cancellationToken);
		if (stored is null) {
			return null;
		}

		var credentials = MastodonCredentials.Unprotect(this._Protector, stored.ProtectedCredentials, stored.Provider);
		if (credentials is null) {
			return null;
		}

		var registration = await this._Db.OAuthAppRegistration
			.AsNoTracking()
			.FirstOrDefaultAsync(
				row => row.Host == credentials.Host && row.Provider == stored.Provider && !row.IsDeleted,
				cancellationToken
			);
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

	private async Task<(MastodonResult<MastodonApp> App, bool QuotaExceeded)> _FindOrRegisterAppAsync(
		Guid tenantId,
		string host,
		SocialProvider provider,
		string scopes,
		CancellationToken cancellationToken
	) {
		var existing = await this._Db.OAuthAppRegistration
			.FirstOrDefaultAsync(
				row => row.Host == host && row.Provider == provider && !row.IsDeleted,
				cancellationToken
			);
		if (existing is not null && existing.RedirectUri == this.RedirectUri && existing.Scopes == scopes) {
			var secret = this._Protector.Unprotect(existing.ProtectedClientSecret, SocialProvider.Mastodon);
			if (secret.Plaintext is not null) {
				return (new MastodonResult<MastodonApp>.Ok(new MastodonApp(existing.ClientId, secret.Plaintext)), false);
			}
		}

		Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction? transaction = null;
		if (existing is null) {
			// A server nobody registered on yet: this is the write a stranger's server sees, so it
			// is capped per tenant (see MaxNewHostRegistrationsPerTenant). The count and the insert
			// run under a per-tenant advisory lock, so parallel starts cannot all read "4 of 5".
			transaction = await this._Db.Database.BeginTransactionAsync(cancellationToken);
			await this._Db.Database.ExecuteSqlInterpolatedAsync(
				$"SELECT pg_advisory_xact_lock(hashtextextended({tenantId.ToString()}, 0))",
				cancellationToken
			);
			var since = DateTime.UtcNow - MastodonOAuthService.NewHostRegistrationWindow;
			var recent = await this._Db.OAuthAppRegistration
				.AsNoTracking()
				.CountAsync(
					row => row.RegisteredByTenantId == tenantId && row.RegisteredAt > since,
					cancellationToken
				);
			if (recent >= MastodonOAuthService.MaxNewHostRegistrationsPerTenant) {
				await transaction.DisposeAsync();
				return (new MastodonResult<MastodonApp>.Unreachable(), true);
			}
		}

		var registered = await this._Client.RegisterAppAsync(
			host, this.RedirectUri, scopes, cancellationToken
		);
		if (registered is not MastodonResult<MastodonApp>.Ok ok) {
			if (transaction is not null) {
				await transaction.DisposeAsync();
			}

			return (registered, false);
		}

		var protectedSecret = this._Protector.Protect(ok.Value.ClientSecret, SocialProvider.Mastodon);
		if (existing is not null) {
			// Stale (redirect or scopes changed) or unreadable: replace in place.
			existing.ClientId = ok.Value.ClientId;
			existing.ProtectedClientSecret = protectedSecret;
			existing.RedirectUri = this.RedirectUri;
			existing.Scopes = scopes;
		} else {
			await this._Db.OAuthAppRegistration.AddAsync(new OAuthAppRegistration {
				Host = host,
				Provider = provider,
				ClientId = ok.Value.ClientId,
				ProtectedClientSecret = protectedSecret,
				Scopes = scopes,
				RedirectUri = this.RedirectUri,
				RegisteredByTenantId = tenantId,
				RegisteredAt = DateTime.UtcNow,
			}, cancellationToken);
		}

		try {
			await this._Db.SaveChangesAsync(cancellationToken);
			if (transaction is not null) {
				await transaction.CommitAsync(cancellationToken);
			}
		} catch (DbUpdateException) {
			// A concurrent first registration won the unique index: use its row.
			if (transaction is not null) {
				await transaction.DisposeAsync();
			}

			this._Db.ChangeTracker.Clear();
			var winner = await this._Db.OAuthAppRegistration
				.AsNoTracking()
				.FirstOrDefaultAsync(
					row => row.Host == host && row.Provider == provider && !row.IsDeleted,
					cancellationToken
				);
			var winnerSecret = this._ClientSecret(winner?.ProtectedClientSecret);
			if (winner is null || winnerSecret is null) {
				return (new MastodonResult<MastodonApp>.Unreachable(), false);
			}

			return (new MastodonResult<MastodonApp>.Ok(new MastodonApp(winner.ClientId, winnerSecret)), false);
		}

		if (transaction is not null) {
			await transaction.DisposeAsync();
		}

		return (ok, false);
	}

	private async Task<CompleteMastodonConnectResult> _StoreAccountAsync(
		Guid tenantId,
		SocialProvider provider,
		string host,
		MastodonAccountInfo identity,
		string accessToken,
		string? overrides,
		CancellationToken cancellationToken
	) {
		var externalId = $"{identity.Id}@{host}";
		var handle = $"{identity.Acct}@{host}";
		var protectedCredentials = new MastodonCredentials(host, accessToken).Protect(this._Protector, provider);
		var existing = await this._Db.SocialAccount.FirstOrDefaultAsync(
			account => account.TenantId == tenantId
				&& account.Provider == provider
				&& account.ExternalAccountId == externalId
				&& !account.IsDeleted,
			cancellationToken
		);

		var account = existing ?? new SocialAccount {
			TenantId = tenantId,
			Provider = provider,
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
