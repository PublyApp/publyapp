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

		// This method ALWAYS writes BOTH user_accounts and users (their UpdatedAt below), so it
		// always participates in the canonical lock order — not only on demotions. EF Core 10
		// finds no FK dependency edge between those two independent updates (neither a principal
		// key nor a dependent FK changes), so its ModificationCommandComparer orders them by
		// table name — user_accounts BEFORE users — the exact inverse of this order. Without
		// holding users(U) first, a non-demoting PATCH (which locks user_accounts inside its
		// SaveChanges, then waits for users) and a demotion of the same member (which holds
		// users, then waits for user_accounts) deadlock: 40P01 -> 500. See
		// TenantMembershipLockOrder, "a write is a lock". READ COMMITTED so the post-lock
		// revalidation and demotion guard read a fresh snapshot after the mutex wait.
		await using var transaction =
			await _dbContext.Database.BeginTransactionAsync(cancellationToken);

		try {
			// TenantMembershipLockOrder step 1 — the identity mutex — taken BEFORE any save so
			// that SaveChanges' own row locks (user_accounts then users) are always acquired
			// while we already hold users(U). Every path that writes a member's user_accounts
			// row (this method, demotion, company create/restore, global suspension) takes
			// users(U) first, so no two of them can hold users and user_accounts in opposite
			// orders.
			await TenantMembershipLockOrder.LockUserIdentityRowsAsync(
				_dbContext,
				[userId],
				cancellationToken
			);

			// Revalidate the tracked target after the mutex wait. While we blocked on users(U),
			// a concurrent holder of it (another PATCH, company create/restore, global
			// suspension) may have soft-deleted the account/user or changed the account level.
			// The demotion decision below MUST be made from this fresh post-lock state: a
			// concurrent promotion to Admin would otherwise turn our "set to User" into an
			// unguarded demotion and could strand the tenant at zero admins.
			await _dbContext.Entry(account).ReloadAsync(cancellationToken);
			await _dbContext.Entry(user).ReloadAsync(cancellationToken);

			if (account.IsDeleted || user.IsDeleted) {
				await transaction.RollbackAsync(cancellationToken);
				return new UpdateTenantUserResult.NotFound();
			}

			// A real demotion (Admin -> non-Admin) is the only branch that can reduce a
			// tenant's active-admin count, so it is the only one that needs the tenant mutex
			// and the last-admin guard.
			var isDemotion =
				newLevel is not null
				&& account.Level == AccountLevel.Admin
				&& newLevel != AccountLevel.Admin;

			if (isDemotion) {
				// Step 2: the tenant's active-admin mutex, taken before the counts below so
				// they include concurrent admin removals. Both guard reads run after both
				// locks, so they are fresh under READ COMMITTED — nothing read before this
				// point is trusted for the invariant decision.
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
					// Explicit rollback: this exit holds users(U) and tenants(T).
					await transaction.RollbackAsync(cancellationToken);
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
			await transaction.CommitAsync(cancellationToken);
		} catch {
			await transaction.RollbackAsync(cancellationToken);
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
