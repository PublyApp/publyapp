using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Providers.Bluesky;
using PublyApp.Api.Modules.SocialAccounts.Providers.Discord;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Mastodon;

/// <summary>
/// Opens a Mastodon or Pixelfed session (#2174, #2175): there is nothing to log in to, because the
/// OAuth access token is already the credential. The session carries the account
/// id (<c>Did</c>), the handle, the token (<c>AccessJwt</c>, redacted when printed)
/// and the instance base URL (<c>PdsHost</c>). A missing or unreadable credential
/// is an account problem; a 401 from the instance surfaces at publish time.
/// </summary>
public sealed class MastodonSessionProvider : ISocialSessionProvider {
	private readonly AppDbContext _Db;
	private readonly ICredentialProtector _Protector;

	public MastodonSessionProvider(AppDbContext db, ICredentialProtector protector) {
		this._Db = db;
		this._Protector = protector;
	}

	public async Task<SocialSessionResult> OpenSessionAsync(
		Guid socialAccountId,
		CancellationToken cancellationToken
	) {
		var account = await (
			from a in this._Db.SocialAccount.AsNoTracking()
			where a.Id == socialAccountId
				&& (a.Provider == SocialProvider.Mastodon || a.Provider == SocialProvider.Pixelfed)
				&& !a.IsDeleted
			select new { a.Provider, a.ExternalAccountId, a.DisplayHandle, a.ProtectedCredentials }
		).FirstOrDefaultAsync(cancellationToken);
		if (account is null) {
			return new SocialSessionResult.AccountFailure("social account not found");
		}

		var credentials = MastodonCredentials.Unprotect(
			this._Protector, account.ProtectedCredentials, account.Provider
		);
		if (credentials is null) {
			return new SocialSessionResult.AccountFailure("no usable stored credential");
		}

		return new SocialSessionResult.Opened(new SocialSession(
			Did: account.ExternalAccountId,
			Handle: account.DisplayHandle,
			AccessJwt: credentials.AccessToken,
			PdsHost: $"https://{credentials.Host}"
		));
	}
}

/// <summary>
/// The registered <see cref="ISocialSessionProvider"/>: routes each open to the
/// provider that owns the account (#2174), so the publish job stays provider-blind.
/// </summary>
public sealed class RoutingSocialSessionProvider : ISocialSessionProvider {
	private readonly AppDbContext _Db;
	private readonly BlueskySessionProvider _Bluesky;
	private readonly MastodonSessionProvider _Mastodon;
	private readonly DiscordWebhookSessionProvider _Discord;

	public RoutingSocialSessionProvider(
		AppDbContext db,
		BlueskySessionProvider bluesky,
		MastodonSessionProvider mastodon,
		DiscordWebhookSessionProvider discord
	) {
		this._Db = db;
		this._Bluesky = bluesky;
		this._Mastodon = mastodon;
		this._Discord = discord;
	}

	public async Task<SocialSessionResult> OpenSessionAsync(
		Guid socialAccountId,
		CancellationToken cancellationToken
	) {
		var provider = await (
			from a in this._Db.SocialAccount.AsNoTracking()
			where a.Id == socialAccountId && !a.IsDeleted
			select (SocialProvider?)a.Provider
		).FirstOrDefaultAsync(cancellationToken);

		if (provider is null) {
			return new SocialSessionResult.AccountFailure("social account not found");
		}

		if (provider == SocialProvider.DiscordWebhook) {
			return await this._Discord.OpenSessionAsync(socialAccountId, cancellationToken);
		}

		return provider is SocialProvider.Mastodon or SocialProvider.Pixelfed
			? await this._Mastodon.OpenSessionAsync(socialAccountId, cancellationToken)
			: await this._Bluesky.OpenSessionAsync(socialAccountId, cancellationToken);
	}
}
