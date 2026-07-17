using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Services;

/// <summary>
/// THE canonical lock order for every path that mutates <c>user_account_profiles</c>.
/// </summary>
/// <remarks>
/// <para>
/// <b>Order: (1) the <c>profiles</c> row, then (2) the <c>user_accounts</c> row, then (3) the
/// <c>user_account_profiles</c> rows.</b> A path that touches only one parent takes only that
/// parent's lock; a path that touches both MUST take them in this order or concurrent paths can
/// deadlock. Every parent lock must be taken <i>before</i> the junction rows are read, because
/// the junction has no lock of its own worth taking: it is hard-deleted, so a row read before a
/// parent is locked carries no guarantee that the parent still exists at write time.
/// </para>
/// <para>
/// <b>Why the lock statement re-validates liveness instead of matching on id alone.</b> Under
/// READ COMMITTED, when <c>SELECT … FOR UPDATE</c> blocks on a row a concurrent writer is
/// updating, PostgreSQL re-evaluates the <c>WHERE</c> clause against the <i>updated</i> row
/// version once that writer commits (EvalPlanQual). Carrying the full liveness predicate
/// (tenant + scope + <c>is_deleted</c>) into the locking statement therefore means a parent that
/// was soft-deleted while we waited yields <b>no row</b> — the caller reports not-found instead
/// of acting on a dead parent. Matching on <c>id</c> alone would return the physical row and let
/// the caller resurrect links under a deleted profile or a removed membership.
/// </para>
/// <para>
/// Writers that are themselves deleting a parent lock it by id only (see
/// <see cref="LockProfileRowsAsync"/> / <see cref="LockUserAccountRowsAsync"/>): they are the
/// ones invalidating the row, so re-validating liveness against their own pending change would
/// be self-defeating. They contend with readers on the same physical row, which is what
/// serializes the two sides.
/// </para>
/// <para>
/// Paths that take this order (keep this list current):
/// <list type="bullet">
/// <item>
/// Profiles → <c>TenantProfileAsStaffService.SetTenantProfileUserAsync</c>
/// (profile, then account)
/// </item>
/// <item>Profiles → <c>TenantProfileAsStaffService.DeleteTenantProfileAsync</c> (profile)</item>
/// <item>
/// Profiles → <c>TenantProfileAsStaffService.BulkDeleteTenantProfilesAsync</c> (profiles)
/// </item>
/// <item>
/// Users → <c>TenantUserMembershipOperations.RemoveUserAccountProfileLinksAsync</c> (account)
/// </item>
/// <item>
/// Users → <c>TenantUserMembershipOperations.BulkRemoveUsersFromTenantAsync</c> (accounts)
/// </item>
/// </list>
/// </para>
/// </remarks>
internal static class UserAccountProfileLockOrder {
	/// <summary>
	/// Step 1: lock the live tenant profile and re-validate tenant, scope and soft-delete state
	/// in the same statement. Returns <c>null</c> when the profile is not a live tenant profile
	/// of <paramref name="tenantId"/> — including when a concurrent delete won the race.
	/// </summary>
	internal static async Task<Profile?> LockLiveTenantProfileAsync(
		AppDbContext dbContext,
		Guid tenantId,
		Guid profileId,
		CancellationToken cancellationToken
	) {
		// ToListAsync (not FirstOrDefaultAsync) keeps EF from composing a LIMIT around the raw
		// SQL; the id predicate already bounds this to at most one row.
		var profiles = await dbContext.Profile
			.FromSql($"""
				SELECT * FROM profiles
				WHERE id = {profileId}
					AND tenant_id = {tenantId}
					AND scope = {(int)ProfileScope.Tenant}
					AND is_deleted = FALSE
				FOR UPDATE
				""")
			.ToListAsync(cancellationToken);

		return profiles.FirstOrDefault();
	}

	/// <summary>
	/// Step 2: lock the live tenant account and re-validate tenant, scope and soft-delete state
	/// in the same statement. Returns <c>null</c> when the account is not a live tenant-scope
	/// membership of <paramref name="tenantId"/> — including when a concurrent removal won the
	/// race. Suspended accounts are deliberately still returned: suspension is not removal, and
	/// staff-side management paths must keep working on suspended members.
	/// </summary>
	internal static async Task<UserAccount?> LockLiveTenantAccountAsync(
		AppDbContext dbContext,
		Guid tenantId,
		Guid userAccountId,
		CancellationToken cancellationToken
	) {
		var accounts = await dbContext.UserAccount
			.FromSql($"""
				SELECT * FROM user_accounts
				WHERE id = {userAccountId}
					AND tenant_id = {tenantId}
					AND scope = {(int)AccountScope.Tenant}
					AND is_deleted = FALSE
				FOR UPDATE
				""")
			.ToListAsync(cancellationToken);

		return accounts.FirstOrDefault();
	}

	/// <summary>
	/// Writer-side profile lock, by id, taken before enumerating a profile's junction rows.
	/// Locks in a deterministic id order so concurrent bulk deletes cannot deadlock each other.
	/// </summary>
	internal static async Task LockProfileRowsAsync(
		AppDbContext dbContext,
		IReadOnlyCollection<Guid> profileIds,
		CancellationToken cancellationToken
	) {
		if (profileIds.Count == 0) {
			return;
		}

		var orderedIds = profileIds.Distinct().OrderBy(id => id).ToArray();

		// LockRows sits above Sort in the plan, so rows are locked in the sorted order.
		_ = await dbContext.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM profiles WHERE id = ANY({orderedIds}) ORDER BY id FOR UPDATE",
			cancellationToken
		);
	}

	/// <summary>
	/// Writer-side account lock, by id, taken before enumerating an account's junction rows.
	/// Locks in a deterministic id order so concurrent bulk removals cannot deadlock each other.
	/// </summary>
	internal static async Task LockUserAccountRowsAsync(
		AppDbContext dbContext,
		IReadOnlyCollection<Guid> userAccountIds,
		CancellationToken cancellationToken
	) {
		if (userAccountIds.Count == 0) {
			return;
		}

		var orderedIds = userAccountIds.Distinct().OrderBy(id => id).ToArray();

		_ = await dbContext.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM user_accounts WHERE id = ANY({orderedIds}) ORDER BY id FOR UPDATE",
			cancellationToken
		);
	}
}
