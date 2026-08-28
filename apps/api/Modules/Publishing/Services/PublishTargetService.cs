using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Lib;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.Publishing.Services;

/// <summary>
/// One row of the composer "Publish on" block: the target account identity plus
/// the wire values the block renders (plan D2 Task 4 interfaces block).
/// </summary>
public record PublishTargetItem {
	public required Guid Id { get; init; }
	public required string Label { get; init; }
	public required string Provider { get; init; }
}

/// <summary>
/// Read-only composer target lookup over THE single visibility rule
/// (<see cref="VisibleIn.Visible"/>) — this slice never re-implements visibility.
/// Active accounts of the tenant only, newest-first with an id tiebreak so the
/// order is stable across identical timestamps.
/// </summary>
public interface IPublishTargetService {
	Task<IReadOnlyList<PublishTargetItem>> FindForTenantAsync(
		Guid tenantId,
		Guid? projectId = null,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public sealed class PublishTargetService : IPublishTargetService {
	private readonly AppDbContext _db;

	public PublishTargetService(AppDbContext db) {
		_db = db;
	}

	public async Task<IReadOnlyList<PublishTargetItem>> FindForTenantAsync(
		Guid tenantId,
		Guid? projectId = null,
		CancellationToken cancellationToken = default
	) {
		IQueryable<SocialAccount> query =
			from a in _db.SocialAccount.AsNoTracking()
			where a.TenantId == tenantId
				&& !a.IsDeleted
				&& a.Status == SocialAccountStatus.Active
			orderby a.CreatedAt descending, a.Id descending
			select a;

		var accounts = await query.ToListAsync(cancellationToken);

		if (projectId.HasValue) {
			await LoadProjectLinksAsync(accounts, cancellationToken);
			accounts = accounts
				.Where(account => VisibleIn.Visible(account, projectId.Value))
				.ToList();
		}

		return accounts
			.Select(account => new PublishTargetItem {
				Id = account.GetRequiredId(),
				Label = account.DisplayHandle,
				// The single source really is called now (#1443). The literal that
				// stood here made this comment false: every target reported
				// "bluesky" regardless of account.Provider, so the first non-Bluesky
				// provider would have been mislabelled on the wire with nothing
				// failing — FormatProvider throws on an unhandled value, a literal
				// cannot.
				Provider = SocialAccountWire.FormatProvider(account.Provider),
			})
			.ToList();
	}

	private async Task LoadProjectLinksAsync(
		List<SocialAccount> accounts,
		CancellationToken cancellationToken
	) {
		if (accounts.Count == 0) {
			return;
		}

		var ids = accounts.Select(a => a.Id).ToList();
		var links = await (
			from l in _db.SocialAccountProject.AsNoTracking()
			where ids.Contains(l.SocialAccountId)
			select l
		).ToListAsync(cancellationToken);

		var byAccount = links.GroupBy(l => l.SocialAccountId)
			.ToDictionary(g => g.Key, g => g.ToList());
		foreach (var account in accounts) {
			account.Projects = byAccount.TryGetValue(
				account.GetRequiredId(), out var value
			) ? value : [];
		}
	}
}
