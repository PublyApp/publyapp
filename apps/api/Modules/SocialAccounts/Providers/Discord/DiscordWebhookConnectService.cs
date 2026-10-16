using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Discord;

public abstract record ConnectDiscordWebhookResult {
	/// <summary><paramref name="WasKnown"/>: the webhook was already connected (a reconnect).</summary>
	public sealed record Connected(SocialAccount Account, bool WasKnown) : ConnectDiscordWebhookResult;

	public sealed record InvalidUrl() : ConnectDiscordWebhookResult;

	/// <summary>The account to replace does not exist (or is revoked) in this tenant.</summary>
	public sealed record AccountNotFound() : ConnectDiscordWebhookResult;

	/// <summary>The pasted webhook is already another account of this tenant.</summary>
	public sealed record AlreadyConnected() : ConnectDiscordWebhookResult;

	/// <summary>Discord does not know this webhook (deleted, or a wrong token).</summary>
	public sealed record Refused() : ConnectDiscordWebhookResult;

	public sealed record Unreachable() : ConnectDiscordWebhookResult;
}

/// <summary>
/// Discord's connect flow (#2175): there is no OAuth, so connecting is "parse the pasted
/// URL, GET it to prove it exists, store it encrypted". The webhook id is the stable
/// identity; pasting the same webhook again is a reconnect. Registered manually (not a
/// <c>[Service]</c>): it is a flow, not a domain service.
/// </summary>
public sealed class DiscordWebhookConnectService {
	private readonly AppDbContext _Db;
	private readonly ICredentialProtector _Protector;
	private readonly DiscordWebhookClient _Client;

	public DiscordWebhookConnectService(
		AppDbContext db,
		ICredentialProtector protector,
		DiscordWebhookClient client
	) {
		this._Db = db;
		this._Protector = protector;
		this._Client = client;
	}

	/// <summary>
	/// <paramref name="replaceAccountId"/> set = a reconnect of THAT account: a deleted
	/// webhook cannot be revived, so the account keeps its row (and its paused queue)
	/// and takes the new webhook's id, name and URL.
	/// </summary>
	public async Task<ConnectDiscordWebhookResult> ConnectAsync(
		Guid tenantId,
		string rawUrl,
		CancellationToken cancellationToken,
		Guid? replaceAccountId = null
	) {
		var webhook = DiscordWebhookUrl.Parse(rawUrl);
		if (webhook is null) {
			return new ConnectDiscordWebhookResult.InvalidUrl();
		}

		var verified = await this._Client.VerifyAsync(webhook, cancellationToken);
		if (verified is DiscordVerifyResult.Refused) {
			return new ConnectDiscordWebhookResult.Refused();
		}

		if (verified is not DiscordVerifyResult.Ok ok) {
			return new ConnectDiscordWebhookResult.Unreachable();
		}

		var protectedCredentials = new DiscordWebhookCredentials(webhook.Full, ok.Info.GuildId)
			.Protect(this._Protector);
		var handle = ok.Info.Name.Length > 100 ? ok.Info.Name[..100] : ok.Info.Name;
		var sameWebhook = await this._Db.SocialAccount.FirstOrDefaultAsync(
			account => account.TenantId == tenantId
				&& account.Provider == SocialProvider.DiscordWebhook
				&& account.ExternalAccountId == webhook.Id
				&& !account.IsDeleted,
			cancellationToken
		);
		var existing = sameWebhook;
		if (replaceAccountId is { } replaceId) {
			existing = await this._Db.SocialAccount.FirstOrDefaultAsync(
				account => account.Id == replaceId
					&& account.TenantId == tenantId
					&& account.Provider == SocialProvider.DiscordWebhook
					&& account.Status != SocialAccountStatus.Revoked
					&& !account.IsDeleted,
				cancellationToken
			);
			if (existing is null) {
				return new ConnectDiscordWebhookResult.AccountNotFound();
			}

			if (sameWebhook is not null && sameWebhook.Id != replaceId) {
				return new ConnectDiscordWebhookResult.AlreadyConnected();
			}
		}

		var account = existing ?? new SocialAccount {
			TenantId = tenantId,
			Provider = SocialProvider.DiscordWebhook,
			ExternalAccountId = webhook.Id,
			DisplayHandle = handle,
			ProtectedCredentials = protectedCredentials,
		};
		account.DisplayHandle = handle;
		account.ExternalAccountId = webhook.Id;
		account.CredentialType = SocialCredentialType.WebhookUrl;
		account.ProtectedCredentials = protectedCredentials;
		account.Status = SocialAccountStatus.Active;
		account.LastError = null;
		account.LastSuccessAt = DateTime.UtcNow;
		if (existing is null) {
			await this._Db.SocialAccount.AddAsync(account, cancellationToken);
		}

		await this._Db.SaveChangesAsync(cancellationToken);
		return new ConnectDiscordWebhookResult.Connected(account, existing is not null);
	}
}
