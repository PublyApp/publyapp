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
	private readonly AppDbContext _DbContext;
	private readonly ILogger<InvitationRevokeService> _Logger;

	public InvitationRevokeService(AppDbContext dbContext, ILogger<InvitationRevokeService> logger) {
		_DbContext = dbContext;
		_Logger = logger;
	}

	public async Task<RevokeInvitationForStaffResult> RevokeInvitationForStaffAsync(
		Guid invitationId,
		CancellationToken cancellationToken = default
	) {
		Invitation? invitation = await _DbContext.Invitation
			.Where(inv => inv.Id == invitationId && inv.Scope == InvitationScope.Staff)
			.FirstOrDefaultAsync(cancellationToken);

		return await _RevokeInvitationInternalAsync(
			invitation,
			invitationId,
			cancellationToken
		);
	}

	// Bulk path is hand-rolled (one SELECT + tracker mutations + one SaveChanges)
	// rather than looping RevokeInvitationForStaffAsync because the per-item
	// method round-trips the DB once per id. Keep classification logic in sync
	// with _RevokeInvitationInternalAsync; if revoke ever grows side effects
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
		var rows = await _DbContext.Invitation
			.Where(inv =>
				inv.Id != null
				&& requestedInvitationIds.Contains(inv.Id.Value)
				&& inv.Scope == InvitationScope.Staff
			)
			.ToListAsync(cancellationToken);

		var foundById = rows.ToDictionary(inv => inv.GetRequiredId());
		var failedItems = new List<BulkStaffInvitationActionFailedItem>();
		var succeededCount = 0;
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

			// Mirror _RevokeInvitationInternalAsync classification:
			// already-revoked is a success no-op; accepted is a hard failure.
			if (invitation.IsRevoked()) {
				if (_Logger.IsEnabled(LogLevel.Information)) {
					_Logger.LogInformation(
						"Invitation {InvitationId} is already revoked; no-op",
						invitationId
					);
				}
				succeededCount++;
				continue;
			}

			if (invitation.IsAccepted()) {
				if (_Logger.IsEnabled(LogLevel.Warning)) {
					_Logger.LogWarning(
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

			if (_Logger.IsEnabled(LogLevel.Information)) {
				_Logger.LogInformation("Revoked invitation {InvitationId}", invitationId);
			}
		}

		// Synchronous outbox/job cancellation retired for the bulk path too (design §5.4):
		// the single-revoke path already stopped eagerly cancelling rows, and the email
		// job's send-time locked eligibility recheck is the authoritative gate. A revoked
		// invitation's pending job resolves to CancelledIneligible at send, visible in
		// email_log — so bulk revoke no longer mutates queue/outbox rows here.
		await _DbContext.SaveChangesAsync(cancellationToken);

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
		Invitation? invitation = await _DbContext.Invitation
			.Where(inv =>
				inv.Id == invitationId
				&& inv.Scope == InvitationScope.Tenant
				&& inv.TenantId == tenantId
			)
			.FirstOrDefaultAsync(cancellationToken);

		RevokeInvitationForStaffResult result = await _RevokeInvitationInternalAsync(
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

	private async Task<RevokeInvitationForStaffResult> _RevokeInvitationInternalAsync(
		Invitation? invitation,
		Guid invitationId,
		CancellationToken cancellationToken
	) {
		if (invitation is null) {
			return new RevokeInvitationForStaffResult.NotFound();
		}

		if (invitation.IsRevoked()) {
			if (_Logger.IsEnabled(LogLevel.Information)) {
				_Logger.LogInformation(
					"Invitation {InvitationId} is already revoked; no-op",
					invitationId
				);
			}
			return new RevokeInvitationForStaffResult.Success();
		}

		if (invitation.IsAccepted()) {
			if (_Logger.IsEnabled(LogLevel.Warning)) {
				_Logger.LogWarning(
					"Attempt to revoke accepted invitation {InvitationId} blocked",
					invitationId
				);
			}
			return new RevokeInvitationForStaffResult.AlreadyAccepted();
		}

		invitation.Status = InvitationStatus.Revoked;
		invitation.RevokedAt = DateTime.UtcNow;

		// Synchronous outbox cancellation retired (design §5.4): the email job's send-time
		// locked eligibility recheck is now the authoritative gate — a revoked
		// invitation resolves to CancelledIneligible at send, visible in email_log.
		await _DbContext.SaveChangesAsync(cancellationToken);

		if (_Logger.IsEnabled(LogLevel.Information)) {
			_Logger.LogInformation("Revoked invitation {InvitationId}", invitationId);
		}

		return new RevokeInvitationForStaffResult.Success();
	}
}
