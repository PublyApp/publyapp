using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Invitations.Entities;

namespace PublyApp.Api.Modules.Invitations.Services;

public interface IInvitationRevokeService {
	Task<RevokeInvitationForStaffResult> RevokeInvitationForStaffAsync(
		Guid invitationId,
		CancellationToken cancellationToken = default);

	Task<BulkStaffInvitationActionResult> BulkRevokeStaffInvitationsAsync(
		IReadOnlyCollection<Guid> invitationIds,
		CancellationToken cancellationToken = default);

	Task<RevokeInvitationForTenantAsStaffResult> RevokeInvitationForTenantAsStaffAsync(
		Guid tenantId,
		Guid invitationId,
		CancellationToken cancellationToken = default);
}

public abstract record RevokeInvitationForStaffResult {
	public sealed record Success : RevokeInvitationForStaffResult;

	public sealed record NotFound : RevokeInvitationForStaffResult;

	public sealed record AlreadyAccepted : RevokeInvitationForStaffResult;
}

public static class BulkStaffInvitationActionFailureReasons {
	public const string NotFound = "not_found";
	public const string AlreadyAccepted = "already_accepted";
}

public record BulkStaffInvitationActionFailedItem(
	Guid InvitationId,
	string Reason
);

public record BulkStaffInvitationActionResult(
	int SucceededCount,
	int FailedCount,
	List<BulkStaffInvitationActionFailedItem> FailedItems
);

public abstract record RevokeInvitationForTenantAsStaffResult {
	public sealed record Success : RevokeInvitationForTenantAsStaffResult;

	public sealed record NotFound : RevokeInvitationForTenantAsStaffResult;

	public sealed record AlreadyAccepted : RevokeInvitationForTenantAsStaffResult;
}

[Service(ServiceLifetime.Scoped)]
public sealed class InvitationRevokeService : IInvitationRevokeService {
	private readonly AppDbContext _dbContext;
	private readonly ILogger<InvitationRevokeService> _logger;

	public InvitationRevokeService(AppDbContext dbContext, ILogger<InvitationRevokeService> logger) {
		_dbContext = dbContext;
		_logger = logger;
	}

	public async Task<RevokeInvitationForStaffResult> RevokeInvitationForStaffAsync(
		Guid invitationId,
		CancellationToken cancellationToken = default
	) {
		Invitation? invitation = await _dbContext.Invitation
			.Where(inv => inv.Id == invitationId && inv.Scope == InvitationScope.Staff)
			.FirstOrDefaultAsync(cancellationToken);

		return await RevokeInvitationInternalAsync(
			invitation,
			invitationId,
			cancellationToken
		);
	}

	// Bulk path is hand-rolled (one SELECT + tracker mutations + one SaveChanges)
	// rather than looping RevokeInvitationForStaffAsync because the per-item
	// method round-trips the DB once per id. Keep classification logic in sync
	// with RevokeInvitationInternalAsync; if revoke ever grows side effects
	// (email, webhook, audit log), they must be replayed here too — they are
	// currently invoked at the handler layer instead.
	public async Task<BulkStaffInvitationActionResult> BulkRevokeStaffInvitationsAsync(
		IReadOnlyCollection<Guid> invitationIds,
		CancellationToken cancellationToken = default
	) {
		var requestedInvitationIds = invitationIds.Distinct().ToList();
		if (requestedInvitationIds.Count == 0) {
			return new BulkStaffInvitationActionResult(0, 0, []);
		}

		// 1 SELECT for all candidates, scope-filtered. Mirrors the per-item
		// RevokeInvitationForStaffAsync read predicate.
		var rows = await _dbContext.Invitation
			.Where(inv =>
				inv.Id != null
				&& requestedInvitationIds.Contains(inv.Id.Value)
				&& inv.Scope == InvitationScope.Staff
			)
			.ToListAsync(cancellationToken);

		var foundById = rows.ToDictionary(inv => inv.GetRequiredId());
		var failedItems = new List<BulkStaffInvitationActionFailedItem>();
		var succeededCount = 0;
		var revokedInvitationIds = new List<Guid>();
		var now = DateTime.UtcNow;

		// Iterate over the requested ids (not over rows) so missing ids surface
		// as NotFound and the failed-items list preserves the requested order.
		foreach (var invitationId in requestedInvitationIds) {
			if (!foundById.TryGetValue(invitationId, out var invitation)) {
				failedItems.Add(new BulkStaffInvitationActionFailedItem(
					invitationId,
					BulkStaffInvitationActionFailureReasons.NotFound
				));
				continue;
			}

			// Mirror RevokeInvitationInternalAsync classification:
			// already-revoked is a success no-op; accepted is a hard failure.
			if (invitation.IsRevoked()) {
				if (_logger.IsEnabled(LogLevel.Information)) {
					_logger.LogInformation(
						"Invitation {InvitationId} is already revoked; no-op",
						invitationId
					);
				}
				succeededCount++;
				continue;
			}

			if (invitation.IsAccepted()) {
				if (_logger.IsEnabled(LogLevel.Warning)) {
					_logger.LogWarning(
						"Attempt to revoke accepted invitation {InvitationId} blocked",
						invitationId
					);
				}
				failedItems.Add(new BulkStaffInvitationActionFailedItem(
					invitationId,
					BulkStaffInvitationActionFailureReasons.AlreadyAccepted
				));
				continue;
			}

			// Mutate via the EF tracker; one SaveChanges flushes them all.
			invitation.Status = InvitationStatus.Revoked;
			invitation.RevokedAt = now;
			succeededCount++;
			revokedInvitationIds.Add(invitationId);

			if (_logger.IsEnabled(LogLevel.Information)) {
				_logger.LogInformation("Revoked invitation {InvitationId}", invitationId);
			}
		}

		// 1 SELECT + tracked update for every still-pending outbox row across the
		// whole batch, not one query per invitation (round-6 API F3, F6 pattern).
		if (revokedInvitationIds.Count > 0) {
			var pendingOutboxRows = await _dbContext.InvitationEmailOutbox
				.Where(o => o.InvitationId != null
					&& revokedInvitationIds.Contains(o.InvitationId.Value)
					&& (o.Status == InvitationEmailOutboxStatus.Pending
						|| o.Status == InvitationEmailOutboxStatus.Processing))
				.ToListAsync(cancellationToken);

			foreach (var outboxRow in pendingOutboxRows) {
				outboxRow.Status = InvitationEmailOutboxStatus.Cancelled;
			}
		}

		// 1 SaveChanges for all updates.
		await _dbContext.SaveChangesAsync(cancellationToken);

		return new BulkStaffInvitationActionResult(
			SucceededCount: succeededCount,
			FailedCount: failedItems.Count,
			FailedItems: failedItems
		);
	}

	public async Task<RevokeInvitationForTenantAsStaffResult> RevokeInvitationForTenantAsStaffAsync(
		Guid tenantId,
		Guid invitationId,
		CancellationToken cancellationToken = default
	) {
		Invitation? invitation = await _dbContext.Invitation
			.Where(inv =>
				inv.Id == invitationId
				&& inv.Scope == InvitationScope.Tenant
				&& inv.TenantId == tenantId
			)
			.FirstOrDefaultAsync(cancellationToken);

		RevokeInvitationForStaffResult result = await RevokeInvitationInternalAsync(
			invitation,
			invitationId,
			cancellationToken
		);

		return result switch {
			RevokeInvitationForStaffResult.Success =>
				new RevokeInvitationForTenantAsStaffResult.Success(),
			RevokeInvitationForStaffResult.AlreadyAccepted =>
				new RevokeInvitationForTenantAsStaffResult.AlreadyAccepted(),
			_ => new RevokeInvitationForTenantAsStaffResult.NotFound()
		};
	}

	private async Task<RevokeInvitationForStaffResult> RevokeInvitationInternalAsync(
		Invitation? invitation,
		Guid invitationId,
		CancellationToken cancellationToken
	) {
		if (invitation is null) {
			return new RevokeInvitationForStaffResult.NotFound();
		}

		if (invitation.IsRevoked()) {
			if (_logger.IsEnabled(LogLevel.Information)) {
				_logger.LogInformation(
					"Invitation {InvitationId} is already revoked; no-op",
					invitationId
				);
			}
			return new RevokeInvitationForStaffResult.Success();
		}

		if (invitation.IsAccepted()) {
			if (_logger.IsEnabled(LogLevel.Warning)) {
				_logger.LogWarning(
					"Attempt to revoke accepted invitation {InvitationId} blocked",
					invitationId
				);
			}
			return new RevokeInvitationForStaffResult.AlreadyAccepted();
		}

		invitation.Status = InvitationStatus.Revoked;
		invitation.RevokedAt = DateTime.UtcNow;

		await InvitationEmailOutbox.CancelPendingForInvitationAsync(
			_dbContext, invitationId, cancellationToken
		);

		await _dbContext.SaveChangesAsync(cancellationToken);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation("Revoked invitation {InvitationId}", invitationId);
		}

		return new RevokeInvitationForStaffResult.Success();
	}
}
