using System.Data;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Services;

internal static class TenantUserMembershipOperations {

	internal static async Task<RemoveUserFromTenantResult> RemoveUserFromTenantAsync(
		AppDbContext dbContext,
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// Find the user account for this tenant
		var userAccount = await (
			from ua in dbContext.UserAccount
			where ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
			select ua
		).FirstOrDefaultAsync(cancellationToken);

		if (userAccount is null) {
			return new RemoveUserFromTenantResult.NotFound();
		}

		// Wrap admin check and soft delete in a transaction to prevent race conditions.
		// READ COMMITTED (not SERIALIZABLE) is required by TenantMembershipLockOrder: this
		// transaction blocks on row locks and must then read what the winner committed, which
		// only a per-statement snapshot gives. The last-admin invariant is protected by the
		// tenant row lock below instead of by SSI.
		await using var transaction =
			await dbContext.Database.BeginTransactionAsync(cancellationToken);

		try {
			// TenantMembershipLockOrder step 2: serialize every admin-reducing path for this
			// tenant before counting admins, so the count includes concurrent removals.
			await TenantMembershipLockOrder.LockTenantRowsAsync(
				dbContext,
				[tenantId],
				cancellationToken
			);

			// Check if this user is the last admin
			if (userAccount.Level == AccountLevel.Admin) {
				var isRemovingActiveAdmin = await IsActiveTenantAdminAsync(
					dbContext,
					tenantId,
					userId,
					cancellationToken
				);
				var activeAdminCount = isRemovingActiveAdmin
					? await CountActiveTenantAdminsAsync(
						dbContext,
						tenantId,
						cancellationToken
					)
					: 0;

				if (isRemovingActiveAdmin && activeAdminCount <= 1) {
					// Explicit rollback: this exit holds the tenant row lock, and the
					// error-exit discipline does not rely on disposal.
					await transaction.RollbackAsync(cancellationToken);
					return new RemoveUserFromTenantResult.CannotRemoveLastAdmin();
				}
			}

			// Soft delete the user account
			userAccount.IsDeleted = true;
			userAccount.DeletedAt = DateTime.UtcNow;
			await RemoveUserAccountProfileLinksAsync(
				dbContext,
				userAccount.GetRequiredId(),
				cancellationToken
			);
			await dbContext.SaveChangesAsync(cancellationToken);

			await transaction.CommitAsync(cancellationToken);
		} catch {
			await transaction.RollbackAsync(cancellationToken);
			throw;
		}

		return new RemoveUserFromTenantResult.Success();
	}

	internal static async Task<BulkTenantUserActionResult> BulkRemoveUsersFromTenantAsync(
		AppDbContext dbContext,
		Guid tenantId,
		IReadOnlyCollection<Guid> userIds,
		CancellationToken cancellationToken = default
	) {
		var requestedUserIds = userIds.Distinct().ToList();
		if (requestedUserIds.Count == 0) {
			return new BulkTenantUserActionResult(0, 0, []);
		}

		// Wrap the batch in a single transaction so the admin-count invariant is checked as one
		// unit, mirroring the single-item path. READ COMMITTED for the same reason as that path:
		// see TenantMembershipLockOrder.
		await using var transaction = await dbContext.Database.BeginTransactionAsync(
			cancellationToken
		);

		try {
			// TenantMembershipLockOrder step 2, before the admin count below.
			await TenantMembershipLockOrder.LockTenantRowsAsync(
				dbContext,
				[tenantId],
				cancellationToken
			);

			var accounts = await (
				from ua in dbContext.UserAccount
				join u in dbContext.User on ua.UserId equals u.Id
				where ua.TenantId == tenantId
					&& ua.Scope == AccountScope.Tenant
					&& !ua.IsDeleted
					&& requestedUserIds.Contains(ua.UserId)
				select new { Account = ua, User = u }
			).ToListAsync(cancellationToken);

			// Grouped rather than a plain ToDictionary: historical rows created before
			// the ux_user_accounts_tenant_active constraint was backfilled may still
			// contain duplicate active memberships for a single user, and a bare
			// ToDictionary throws on the second key. Deterministically picking the
			// newest row to act on keeps this bulk operation from 500ing on legacy
			// duplicate data; it does not itself repair the duplicate.
			var accountByUserId = accounts
				.GroupBy(row => row.Account.UserId)
				.ToDictionary(
					group => group.Key,
					group => group.OrderByDescending(row => row.Account.CreatedAt).First()
				);
			var activeAdminCount = await CountActiveTenantAdminsAsync(
				dbContext,
				tenantId,
				cancellationToken
			);

			var failedItems = new List<BulkTenantUserActionFailedItem>();
			var succeededAccountIds = new List<Guid>();

			foreach (var userId in requestedUserIds) {
				if (!accountByUserId.TryGetValue(userId, out var row)) {
					// Stable token, not prose — the handler's wire contract maps this
					// straight through so the frontend can translate it, rather than
					// an English string it would have to pattern-match.
					failedItems.Add(
						new BulkTenantUserActionFailedItem(userId, "not-found")
					);
					continue;
				}

				var account = row.Account;
				var user = row.User;
				var isActiveAdmin = account.Level == AccountLevel.Admin
					&& account.Status != AccountStatus.Suspended
					&& !user.IsDeleted
					&& user.Status != UserStatus.Suspended;

				if (isActiveAdmin) {
					if (activeAdminCount <= 1) {
						failedItems.Add(
							new BulkTenantUserActionFailedItem(
								userId,
								"last-admin"
							)
						);
						continue;
					}

					activeAdminCount--;
				}

				account.IsDeleted = true;
				account.DeletedAt = DateTime.UtcNow;
				succeededAccountIds.Add(account.GetRequiredId());
			}

			if (succeededAccountIds.Count > 0) {
				// TenantMembershipLockOrder step 4, batched: pin every account being removed
				// (in a deterministic id order) before touching their junction rows, so a
				// concurrent tenant-profile assign cannot leave a link behind a removed
				// membership.
				await TenantMembershipLockOrder.LockUserAccountRowsAsync(
					dbContext,
					succeededAccountIds,
					cancellationToken
				);

				// Step 5: lock and materialize in one statement. This is what makes the batch
				// see links committed while it waited, and hands back only survivors so a
				// concurrent profile-delete cleanup cannot turn this into a tracked delete of
				// an already-deleted row.
				var links = await TenantMembershipLockOrder
					.LockAndMaterializeLinksForAccountsAsync(
						dbContext,
						succeededAccountIds,
						cancellationToken
					);
				dbContext.UserAccountProfile.RemoveRange(links);
			}

			await dbContext.SaveChangesAsync(cancellationToken);
			await transaction.CommitAsync(cancellationToken);

			return new BulkTenantUserActionResult(
				SucceededCount: succeededAccountIds.Count,
				FailedCount: failedItems.Count,
				FailedItems: failedItems
			);
		} catch {
			await transaction.RollbackAsync(cancellationToken);
			throw;
		}
	}

	internal static async Task<SuspendTenantUserResult> SuspendTenantUserAsync(
		AppDbContext dbContext,
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// Find the user account for this tenant
		var userAccount = await (
			from ua in dbContext.UserAccount
			join u in dbContext.User on ua.UserId equals u.Id
			where ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !u.IsDeleted
			select new { User = u, Account = ua }
		).FirstOrDefaultAsync(cancellationToken);

		if (userAccount is null) {
			return new SuspendTenantUserResult.NotFound();
		}

		var account = userAccount.Account;

		if (account.IsSuspended()) {
			return new SuspendTenantUserResult.AlreadySuspended();
		}

		// Check last-admin invariant: cannot suspend the last active admin
		if (account.Level == AccountLevel.Admin) {
			var isSuspendingActiveAdmin = await IsActiveTenantAdminAsync(
				dbContext,
				tenantId,
				userId,
				cancellationToken
			);
			var activeAdminCount = isSuspendingActiveAdmin
				? await CountActiveTenantAdminsAsync(
					dbContext,
					tenantId,
					cancellationToken
				)
				: 0;

			if (isSuspendingActiveAdmin && activeAdminCount <= 1) {
				return new SuspendTenantUserResult.CannotSuspendLastAdmin();
			}
		}

		// Use atomic update for race-condition safety
		var rowsAffected = await dbContext.UserAccount
			.Where(ua =>
				ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& ua.Status != AccountStatus.Suspended
			)
			.ExecuteUpdateAsync(setters => setters
				.SetProperty(ua => ua.Status, AccountStatus.Suspended)
				.SetProperty(ua => ua.UpdatedAt, DateTime.UtcNow),
				cancellationToken);

		if (rowsAffected == 0) {
			return new SuspendTenantUserResult.AlreadySuspended();
		}

		// Re-fetch to return current state
		var updatedAccount = await (
			from ua in dbContext.UserAccount
				.AsNoTracking()
			join u in dbContext.User on ua.UserId equals u.Id
			where ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
			select new { User = u, Account = ua }
		).FirstOrDefaultAsync(cancellationToken);

		if (updatedAccount is null) {
			throw new InvalidOperationException(
				"User account not found after successful suspend. "
				+ "This indicates a data integrity issue."
			);
		}

		return new SuspendTenantUserResult.Success(
			new TenantUserData {
				User = updatedAccount.User,
				Account = updatedAccount.Account,
				AccountLevel = updatedAccount.Account.Level
			}
		);
	}

	internal static async Task<ReactivateTenantUserResult> ReactivateTenantUserAsync(
		AppDbContext dbContext,
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// Find the user account for this tenant
		var userAccount = await (
			from ua in dbContext.UserAccount
				.AsNoTracking()
			join u in dbContext.User on ua.UserId equals u.Id
			where ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !u.IsDeleted
			select new { User = u, Account = ua }
		).FirstOrDefaultAsync(cancellationToken);

		if (userAccount is null) {
			return new ReactivateTenantUserResult.NotFound();
		}

		var account = userAccount.Account;

		if (!account.IsSuspended()) {
			return new ReactivateTenantUserResult.NotSuspended();
		}

		// Use atomic update for race-condition safety
		var rowsAffected = await dbContext.UserAccount
			.Where(ua =>
				ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& ua.Status == AccountStatus.Suspended
			)
			.ExecuteUpdateAsync(setters => setters
				.SetProperty(ua => ua.Status, AccountStatus.Active)
				.SetProperty(ua => ua.UpdatedAt, DateTime.UtcNow),
				cancellationToken);

		if (rowsAffected == 0) {
			return new ReactivateTenantUserResult.NotSuspended();
		}

		// Re-fetch to return current state
		var updatedAccount = await (
			from ua in dbContext.UserAccount
				.AsNoTracking()
			join u in dbContext.User on ua.UserId equals u.Id
			where ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
			select new { User = u, Account = ua }
		).FirstOrDefaultAsync(cancellationToken);

		if (updatedAccount is null) {
			throw new InvalidOperationException(
				"User account not found after successful reactivate. "
				+ "This indicates a data integrity issue."
			);
		}

		return new ReactivateTenantUserResult.Success(
			new TenantUserData {
				User = updatedAccount.User,
				Account = updatedAccount.Account,
				AccountLevel = updatedAccount.Account.Level
			}
		);
	}

	internal static async Task<bool> IsActiveTenantAdminAsync(
		AppDbContext dbContext,
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken
	) {
		return await (
			from ua in BuildActiveTenantAdminAccountsQuery(dbContext, tenantId)
			where ua.UserId == userId
			select ua
		).AnyAsync(cancellationToken);
	}

	internal static async Task<bool> TenantHasAnotherActiveAdminAsync(
		AppDbContext dbContext,
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken
	) {
		return await (
			from ua in BuildActiveTenantAdminAccountsQuery(dbContext, tenantId)
			where ua.UserId != userId
			select ua
		).AnyAsync(cancellationToken);
	}

	internal static async Task RemoveUserAccountProfileLinksAsync(
		AppDbContext dbContext,
		Guid userAccountId,
		CancellationToken cancellationToken
	) {
		// TenantMembershipLockOrder step 4: pin the account row before touching its junction
		// rows. Without this, a concurrent tenant-profile assign could insert a link after this
		// enumeration and leave a live link behind a removed membership.
		await TenantMembershipLockOrder.LockUserAccountRowsAsync(
			dbContext,
			[userAccountId],
			cancellationToken
		);

		// Step 5: lock and materialize in one statement. UserAccountProfile is current
		// membership state — hard-delete links when membership is removed or restored so stale
		// permissions cannot return. Locking here also means a concurrent profile-delete cleanup
		// hands us only survivors instead of a row it already deleted.
		var links = await TenantMembershipLockOrder.LockAndMaterializeLinksForAccountsAsync(
			dbContext,
			[userAccountId],
			cancellationToken
		);

		dbContext.UserAccountProfile.RemoveRange(links);
	}

	private static IQueryable<UserAccount> BuildActiveTenantAdminAccountsQuery(
		AppDbContext dbContext,
		Guid tenantId
	) {
		// A globally suspended User cannot satisfy tenant last-admin protection,
		// even when the tenant membership row itself is still active.
		return
			from ua in dbContext.UserAccount
			join u in dbContext.User on ua.UserId equals u.Id
			where ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& ua.Level == AccountLevel.Admin
				&& ua.Status != AccountStatus.Suspended
				&& !ua.IsDeleted
				&& !u.IsDeleted
				&& u.Status != UserStatus.Suspended
			select ua;
	}

	private static async Task<int> CountActiveTenantAdminsAsync(
		AppDbContext dbContext,
		Guid tenantId,
		CancellationToken cancellationToken
	) {
		return await BuildActiveTenantAdminAccountsQuery(dbContext, tenantId)
			.CountAsync(cancellationToken);
	}
}
