using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Providers.Bluesky;
using PublyApp.Api.Modules.SocialAccounts.Providers.Discord;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Mastodon;

/// <summary>
/// The registered <see cref="ISocialSessionProvider"/>: routes each open to the
/// provider that owns the account (#2174), so the publish job stays provider-blind.
/// </summary>
public sealed class RoutingSocialSessionAdapter : ISocialSessionProvider {
	private readonly AppDbContext _Db;
	private readonly IReadOnlyDictionary<SocialProvider, ISocialSessionProvider> _Providers;

	public RoutingSocialSessionAdapter(
		AppDbContext db,
		BlueskySessionAdapter bluesky,
		MastodonSessionAdapter mastodon,
		DiscordWebhookSessionAdapter discord
	) {
		this._Db = db;
		this._Providers = new (SocialProvider Network, ISocialSessionProvider Provider)[] {
			(SocialProvider.Bluesky, bluesky),
			(SocialProvider.Mastodon, mastodon),
			(SocialProvider.Pixelfed, mastodon),
			(SocialProvider.DiscordWebhook, discord),
		}.ToDictionary(entry => entry.Network, entry => entry.Provider);
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

		if (!this._Providers.TryGetValue(provider.Value, out var sessionProvider)) {
			return new SocialSessionResult.AccountFailure(
				$"no session provider is registered for network '{provider.Value}'"
			);
		}

		return await sessionProvider.OpenSessionAsync(socialAccountId, cancellationToken);
	}
}
