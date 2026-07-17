using System.Data;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Services;

public abstract record RemoveUserFromTenantResult {
	public sealed record Success() : RemoveUserFromTenantResult;
	public sealed record NotFound() : RemoveUserFromTenantResult;
	public sealed record CannotRemoveLastAdmin() : RemoveUserFromTenantResult;
}

public sealed record BulkRemoveUsersFromTenantArgs(
	Guid TenantId,
	IReadOnlyCollection<Guid> UserIds
);

public sealed record BulkTenantUserActionFailedItem(
	Guid UserId,
	string Error
);

public sealed record BulkTenantUserActionResult(
	int SucceededCount,
	int FailedCount,
	List<BulkTenantUserActionFailedItem> FailedItems
);

public class UpdateTenantUserDocument {
	public PatchField<string?> FirstName { get; set; } = PatchField<string?>.Absent();
	public PatchField<string?> LastName { get; set; } = PatchField<string?>.Absent();
	public PatchField<string?> AvatarUrl { get; set; } = PatchField<string?>.Absent();
	public string? Level { get; set; }
}

public abstract record UpdateTenantUserResult {
	public sealed record Success(
		TenantUserData UserData
	) : UpdateTenantUserResult;
	public sealed record NotFound() : UpdateTenantUserResult;
	public sealed record CannotDemoteLastAdmin() : UpdateTenantUserResult;
}

public abstract record SuspendTenantUserResult {
	public sealed record Success(TenantUserData UserData) : SuspendTenantUserResult;
	public sealed record NotFound() : SuspendTenantUserResult;
	public sealed record AlreadySuspended() : SuspendTenantUserResult;
	public sealed record CannotSuspendLastAdmin() : SuspendTenantUserResult;
}

public abstract record ReactivateTenantUserResult {
	public sealed record Success(TenantUserData UserData) : ReactivateTenantUserResult;
	public sealed record NotFound() : ReactivateTenantUserResult;
	public sealed record NotSuspended() : ReactivateTenantUserResult;
}

public interface ITenantUserMembershipService {
	Task<RemoveUserFromTenantResult> RemoveUserFromTenantAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	);
	Task<BulkTenantUserActionResult> BulkRemoveUsersFromTenantAsync(
		BulkRemoveUsersFromTenantArgs args,
		CancellationToken cancellationToken = default
	);
	Task<UpdateTenantUserResult> UpdateTenantUserAsync(
		Guid tenantId,
		Guid userId,
		UpdateTenantUserDocument document,
		CancellationToken cancellationToken = default
	);
	Task<SuspendTenantUserResult> SuspendTenantUserAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	);
	Task<ReactivateTenantUserResult> ReactivateTenantUserAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public class TenantUserMembershipService : ITenantUserMembershipService {

	private readonly AppDbContext _dbContext;

	public TenantUserMembershipService(
		AppDbContext dbContext,
		ILogger<TenantUserMembershipService> logger
	) {
		_dbContext = dbContext;
		_ = logger;
	}

	public async Task<RemoveUserFromTenantResult> RemoveUserFromTenantAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		return await TenantUserMembershipOperations.RemoveUserFromTenantAsync(
			_dbContext,
			tenantId,
			userId,
			cancellationToken
		);
	}

	public async Task<BulkTenantUserActionResult> BulkRemoveUsersFromTenantAsync(
		BulkRemoveUsersFromTenantArgs args,
		CancellationToken cancellationToken = default
	) {
		return await TenantUserMembershipOperations.BulkRemoveUsersFromTenantAsync(
			_dbContext,
			args.TenantId,
			args.UserIds,
			cancellationToken
		);
	}

	public async Task<UpdateTenantUserResult> UpdateTenantUserAsync(
		Guid tenantId,
		Guid userId,
		UpdateTenantUserDocument document,
		CancellationToken cancellationToken = default
	) {
		// Find the user and their account for this tenant
		var userAccount = await (
			from ua in _dbContext.UserAccount
			join u in _dbContext.User on ua.UserId equals u.Id
			where ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !u.IsDeleted
			select new { User = u, Account = ua }
		).FirstOrDefaultAsync(cancellationToken);

		if (userAccount is null) {
			return new UpdateTenantUserResult.NotFound();
		}

		var user = userAccount.User;
		var account = userAccount.Account;

		// Determine new level if provided
		AccountLevel? newLevel = null;
		if (document.Level is not null) {
			newLevel = UserAccount.ParseLevel(document.Level);
			if (newLevel is null) {
				return new UpdateTenantUserResult.NotFound();
			}
		}

		// Determine if we need a transaction for the last-admin invariant check
		var needsAdminInvariantTransaction =
			document.Level is not null
			&& account.Level == AccountLevel.Admin
			&& newLevel != AccountLevel.Admin;

		// READ COMMITTED, not SERIALIZABLE: demotion shares the last-admin invariant with the
		// removal paths, so it must share their protocol. SSI could only protect this invariant
		// while every participant was SERIALIZABLE; those paths now take the tenant row lock
		// under READ COMMITTED (see TenantMembershipLockOrder), and a lock protocol only works
		// if every participant honours it.
		await using var transaction =
			needsAdminInvariantTransaction
				? await _dbContext.Database.BeginTransactionAsync(cancellationToken)
				: null;

		try {
			// Check last-admin invariant if demoting from admin
			if (needsAdminInvariantTransaction) {
				// TenantMembershipLockOrder step 1: the tenant's active-admin mutex, taken
				// before the counts below so they include concurrent admin removals.
				await TenantMembershipLockOrder.LockTenantRowsAsync(
					_dbContext,
					[tenantId],
					cancellationToken
				);

				var isDemotingActiveAdmin = await TenantUserMembershipOperations
					.IsActiveTenantAdminAsync(
					_dbContext,
					tenantId,
					userId,
					cancellationToken
				);
				var hasAnotherActiveAdmin = isDemotingActiveAdmin
					&& await TenantUserMembershipOperations
						.TenantHasAnotherActiveAdminAsync(
						_dbContext,
						tenantId,
						userId,
						cancellationToken
					);

				if (isDemotingActiveAdmin && !hasAnotherActiveAdmin) {
					return new UpdateTenantUserResult.CannotDemoteLastAdmin();
				}
			}

			// Apply all changes: account level + user profile fields
			if (newLevel is not null) {
				account.Level = newLevel.Value;
			}
			if (document.FirstName.IsPresent) {
				user.FirstName = document.FirstName.Value;
			}
			if (document.LastName.IsPresent) {
				user.LastName = document.LastName.Value;
			}
			if (document.AvatarUrl.IsPresent) {
				user.AvatarUrl = document.AvatarUrl.Value;
			}

			account.UpdatedAt = DateTime.UtcNow;
			user.UpdatedAt = DateTime.UtcNow;

			await _dbContext.SaveChangesAsync(cancellationToken);

			if (transaction is not null) {
				await transaction.CommitAsync(cancellationToken);
			}
		} catch {
			if (transaction is not null) {
				await transaction.RollbackAsync(cancellationToken);
			}
			throw;
		}

		return new UpdateTenantUserResult.Success(
			new TenantUserData {
				User = user,
				Account = account,
				AccountLevel = account.Level
			}
		);
	}

	public async Task<SuspendTenantUserResult> SuspendTenantUserAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		return await TenantUserMembershipOperations.SuspendTenantUserAsync(
			_dbContext,
			tenantId,
			userId,
			cancellationToken
		);
	}

	public async Task<ReactivateTenantUserResult> ReactivateTenantUserAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		return await TenantUserMembershipOperations.ReactivateTenantUserAsync(
			_dbContext,
			tenantId,
			userId,
			cancellationToken
		);
	}
}
