using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Discord;

/// <summary>
/// Opens a Discord webhook "session" (#2175): the stored webhook URL is the whole
/// credential, so there is nothing to log in to. The session carries the webhook id
/// (<c>Did</c>), the name, the URL as <c>AccessJwt</c> (redacted when printed) and,
/// as <c>PdsHost</c>, the message-link prefix <c>https://discord.com/channels/{guild}</c>
/// (empty when Discord reported no server, which means no link).
/// </summary>
public sealed class DiscordWebhookSessionProvider : ISocialSessionProvider {
	private readonly AppDbContext _Db;
	private readonly ICredentialProtector _Protector;

	public DiscordWebhookSessionProvider(AppDbContext db, ICredentialProtector protector) {
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
				&& a.Provider == SocialProvider.DiscordWebhook
				&& !a.IsDeleted
			select new { a.ExternalAccountId, a.DisplayHandle, a.ProtectedCredentials }
		).FirstOrDefaultAsync(cancellationToken);
		if (account is null) {
			return new SocialSessionResult.AccountFailure("social account not found");
		}

		var credentials = DiscordWebhookCredentials.Unprotect(this._Protector, account.ProtectedCredentials);
		if (credentials is null) {
			return new SocialSessionResult.AccountFailure("no usable stored credential");
		}

		return new SocialSessionResult.Opened(new SocialSession(
			Did: account.ExternalAccountId,
			Handle: account.DisplayHandle,
			AccessJwt: credentials.WebhookUrl,
			PdsHost: credentials.GuildId is null ? string.Empty : $"https://discord.com/channels/{credentials.GuildId}"
		));
	}
}
