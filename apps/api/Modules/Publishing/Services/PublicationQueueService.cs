using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Publishing.Entities;

namespace PublyApp.Api.Modules.Publishing.Services;

public sealed record FindPublicationsOfAccountArgs(Guid TenantId, Guid SocialAccountId);

/// <summary>
/// Read-only view of one social account's publishing queue, consumed by the C4
/// reconnect/disconnect handler orchestration. Tenant-scoped loads: a foreign
/// tenant's rows are invisible. Never writes — status moves go through
/// <see cref="IPublicationStatusTransitionService"/> in the calling handler.
/// </summary>
public interface IPublicationQueueService {
	/// <summary>
	/// Non-terminal rows (Scheduled + Paused) of one account, with their instants
	/// and current status so the caller can decide resume vs re-pause.
	/// </summary>
	public Task<IReadOnlyList<(Guid Id, DateTime ScheduledAtUtc, PublicationStatus Status)>>
		FindNonTerminalForAccountAsync(
			FindPublicationsOfAccountArgs args,
			CancellationToken cancellationToken
		);
}

[Service(ServiceLifetime.Scoped)]
public sealed class PublicationQueueService(AppDbContext db) : IPublicationQueueService {
	private readonly AppDbContext _db = db;

	public async Task<IReadOnlyList<(Guid Id, DateTime ScheduledAtUtc, PublicationStatus Status)>>
		FindNonTerminalForAccountAsync(
			FindPublicationsOfAccountArgs args,
			CancellationToken cancellationToken
		) {
		var rows = await _db.Publication.AsNoTracking()
			.Where(p => p.TenantId == args.TenantId
				&& p.SocialAccountId == args.SocialAccountId
				&& !p.IsDeleted
				&& (p.Status == PublicationStatus.Scheduled
					|| p.Status == PublicationStatus.Paused))
			.OrderBy(p => p.ScheduledAtUtc)
			.ToListAsync(cancellationToken);

		return rows
			.Select(p => (p.GetRequiredId(), p.ScheduledAtUtc, p.Status))
			.ToList();
	}
}
