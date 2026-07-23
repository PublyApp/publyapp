using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Services;

/// <summary>
/// THE canonical lock order for tenant-membership mutations: everything that changes a tenant's
/// active-admin set or the <c>user_account_profiles</c> junction.
/// </summary>
/// <remarks>
/// <para>
/// <b>Order: (1) <c>users</c> → (2) <c>tenants</c> → (3) <c>profiles</c> →
/// (4) <c>user_accounts</c> → (5) <c>user_account_profiles</c>.</b> A path takes only the steps
/// it needs, but never takes them out of this order, and always takes a parent before reading
/// the children it will act on.
/// Within a step, rows are locked in a deterministic id order — for the junction, always
/// <c>(user_account_id, profile_id)</c>, the same key for both the profile axis and the account
/// axis, so cross-axis cleanups acquire shared rows in the same relative order and cannot
/// deadlock.
/// </para>
/// <para>
/// <b>Everything here requires READ COMMITTED.</b> The protocol is "block on a lock, then read
/// what the winner committed", and only READ COMMITTED takes a fresh snapshot per statement.
/// Under REPEATABLE READ/SERIALIZABLE the snapshot is frozen at the transaction's first
/// statement, and waiting on a row lock does not refresh it: a waiter would acquire the lock and
/// then still read a pre-lock view, silently missing rows the winner committed while it waited.
/// Do not raise the isolation level of a path that takes these locks.
/// </para>
/// <para>
/// <b>Why the liveness predicate travels inside the locking statement</b> (steps 3 and 4, the
/// <c>LockLive*</c> helpers). Under READ COMMITTED, when <c>SELECT … FOR UPDATE</c> blocks on a
/// row a concurrent writer is updating, PostgreSQL re-evaluates the <c>WHERE</c> clause against
/// the updated row version once that writer commits (EvalPlanQual). Carrying the full liveness
/// predicate (tenant + scope + <c>is_deleted</c>) into the locking statement therefore means a
/// parent that was soft-deleted while we waited yields <b>no row</b> — the caller reports
/// not-found instead of acting on a dead parent. Matching on <c>id</c> alone would return the
/// physical row and let the caller resurrect links under a deleted profile or a removed
/// membership.
/// </para>
/// <para>
/// Writers that are themselves invalidating a parent lock it by id only
/// (<see cref="LockProfileRowsAsync"/> / <see cref="LockUserAccountRowsAsync"/>): re-validating
/// liveness against their own pending change would be self-defeating. They contend with readers
/// on the same physical row, which is what serializes the two sides.
/// </para>
/// <para>
/// <b>Step 1 — the user row — is the identity mutex, and it exists because a lock set
/// discovered before it is frozen is not a lock set.</b> Global suspension must guard every
/// tenant where the user is an active admin, so it derives its tenant set by enumerating that
/// user's memberships. Nothing about the tenant locks it then takes prevents a concurrent path
/// from <i>adding</i> a membership in a tenant that was not in the enumeration — that tenant
/// simply never contends, and no id-ordering can repair an incomplete set. So every path that
/// creates or restores a tenant membership <b>for an already-existing identity</b> takes that
/// user's row lock first, and global suspension holds it across enumerate-lock-guard-write. The
/// set is then frozen for the whole operation rather than merely fresh at one instant.
/// </para>
/// <para>
/// Paths that only <i>promote</i> an existing membership need no identity mutex: the tenant is
/// already in the enumeration, and adding an admin can only raise an active-admin count, never
/// strand a tenant at zero.
/// </para>
/// <para>
/// <b>Step 2 — the tenant row — is the tenant's active-admin mutex.</b> "A tenant keeps at least
/// one active admin" is a COUNT invariant over many rows, which no constraint can express and no
/// lock on the acted-upon account can protect: two transactions removing two different admins
/// touch disjoint rows, so nothing collides — classic write skew. Every path that may reduce a
/// tenant's active-admin set must therefore take that tenant's row lock before counting admins,
/// so the count it reads already includes whatever a concurrent admin-reducing path committed.
/// </para>
/// <para>
/// Paths that take this order (keep this list current):
/// <list type="bullet">
/// <item>
/// Profiles → <c>TenantProfileAsStaffService.SetTenantProfileUserAsync</c> (profile, account)
/// </item>
/// <item>
/// Profiles → <c>TenantProfileAsStaffService.DeleteTenantProfileAsync</c> (profile, links)
/// </item>
/// <item>
/// Profiles → <c>TenantProfileAsStaffService.BulkDeleteTenantProfilesAsync</c>
/// (profiles, links)
/// </item>
/// <item>
/// Users → <c>TenantUserMembershipOperations.RemoveUserFromTenantAsync</c>
/// (tenant, account, links)
/// </item>
/// <item>
/// Users → <c>TenantUserMembershipOperations.SuspendTenantUserAsync</c> (tenant)
/// </item>
/// <item>
/// Users → <c>TenantUserMembershipOperations.BulkRemoveUsersFromTenantAsync</c>
/// (tenant, accounts, links)
/// </item>
/// <item>
/// Users → <c>TenantUserMembershipOperations.RemoveUserAccountProfileLinksAsync</c>
/// (account, links)
/// </item>
/// <item>
/// Users → <c>TenantUserMembershipService.UpdateTenantUserAsync</c> (user always, then tenant
/// only when demoting — it always writes both the users and user_accounts rows, so it must
/// hold users(U) before either its own SaveChanges locks user_accounts or it takes the tenant
/// lock)
/// </item>
/// <item>
/// Users → <c>TenantUserIdentityService.SuspendTenantUserIdentityForStaffAsync</c>
/// (user, then tenants)
/// </item>
/// <item>
/// Users → <c>TenantUserCompanyMembershipService.AssignTenantUserCompaniesForStaffAsync</c>
/// (user — it creates/restores a membership for an existing identity)
/// </item>
/// <item>
/// Invitations → <c>InvitationAcceptanceService.AcceptTenantInvitationForExistingUserAsync</c>
/// (user — same reason)
/// </item>
/// </list>
/// </para>
/// <para>
/// <c>InvitationAcceptanceService.AcceptTenantInvitationAsync</c> deliberately takes no identity
/// mutex: it creates the user inside its own transaction, so no concurrent operation can be
/// guarding that identity yet. <c>AccountService.CreateTenantAccountAsync</c> would need one, but
/// it has no production caller.
/// </para>
/// <para>
/// <b>A write is a lock.</b> When checking a path against this order, count the rows it
/// <i>writes</i>, not only the ones it locks explicitly: <c>SaveChanges</c> takes a row lock on
/// everything it updates, at the end, which is the easiest way to acquire a step out of order.
/// Demotion is the worked example — it takes no explicit user lock but always writes
/// <c>user.UpdatedAt</c>, so before this was corrected it held <c>tenants</c> and then wanted
/// <c>users</c>, deadlocking against global suspension in the opposite order.
/// </para>
/// <para>
/// Audit-log inserts take a foreign-key <c>FOR KEY SHARE</c> on the actor's <c>users</c> row.
/// That conflicts only with <c>FOR UPDATE</c>. It is <b>not</b> true that no identity-mutex
/// holder ever waits on a profile, account or junction row — company assignment holds
/// <c>users(U)</c> while it writes <c>user_accounts</c>, purges junction rows and may insert a
/// default-profile link, and existing-user invitation acceptance holds <c>users(U)</c> while it
/// creates an account and profile links. No audit cycle forms all the same, but for a narrower
/// reason: the only audited path here, <c>SetTenantProfileUserAsync</c>, takes its
/// <c>FOR KEY SHARE</c> on the <b>staff</b> actor's <c>users</c> row, while these mutex
/// participants target <b>tenant</b> identities, and staff/tenant scope exclusivity means those
/// two <c>users</c> rows are never the same row. Do not restate the broad claim: it teaches the
/// exact auditing mistake this order exists to prevent.
/// </para>
/// </remarks>
internal static class TenantMembershipLockOrder {
	/// <summary>
	/// Step 1: the identity mutex. Take before enumerating an identity's tenant memberships on a
	/// path that guards them, and before creating or restoring a membership for an identity that
	/// already exists. Locks in a deterministic id order.
	/// </summary>
	internal static async Task LockUserIdentityRowsAsync(
		AppDbContext dbContext,
		IReadOnlyCollection<Guid> userIds,
		CancellationToken cancellationToken
	) {
		if (userIds.Count == 0) {
			return;
		}

		var orderedIds = userIds.Distinct().OrderBy(id => id).ToArray();

		_ = await dbContext.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM users WHERE id = ANY({orderedIds}) ORDER BY id FOR UPDATE",
			cancellationToken
		);
	}

	/// <summary>
	/// Step 2: the tenant's active-admin mutex. Take before counting active admins on any path
	/// that may reduce that count. Locks in a deterministic id order so a path spanning several
	/// tenants cannot deadlock against another.
	/// </summary>
	internal static async Task LockTenantRowsAsync(
		AppDbContext dbContext,
		IReadOnlyCollection<Guid> tenantIds,
		CancellationToken cancellationToken
	) {
		if (tenantIds.Count == 0) {
			return;
		}

		var orderedIds = tenantIds.Distinct().OrderBy(id => id).ToArray();

		_ = await dbContext.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM tenants WHERE id = ANY({orderedIds}) ORDER BY id FOR UPDATE",
			cancellationToken
		);
	}

	/// <summary>
	/// Step 3: lock the live tenant profile and re-validate tenant, scope and soft-delete state
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
	/// Step 4: lock the live tenant account and re-validate tenant, scope and soft-delete state
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
	/// Step 3, writer side: lock profile rows by id before enumerating their junction rows.
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
	/// Step 4, writer side: lock account rows by id before enumerating their junction rows.
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

	/// <summary>
	/// Step 5, account axis: lock and materialize the junction rows of the given accounts in one
	/// statement. The returned rows are the survivors — a row a concurrent cleanup deleted while
	/// we waited is re-evaluated away rather than handed back, which is what stops EF issuing a
	/// tracked DELETE for a row that is already gone
	/// (<c>DbUpdateConcurrencyException</c> → rolled-back transaction → 500 for the loser).
	/// </summary>
	internal static async Task<List<UserAccountProfile>>
		LockAndMaterializeLinksForAccountsAsync(
			AppDbContext dbContext,
			IReadOnlyCollection<Guid> userAccountIds,
			CancellationToken cancellationToken
		) {
		if (userAccountIds.Count == 0) {
			return [];
		}

		var ids = userAccountIds.Distinct().ToArray();

		return await dbContext.UserAccountProfile
			.FromSql($"""
				SELECT * FROM user_account_profiles
				WHERE user_account_id = ANY({ids})
				ORDER BY user_account_id, profile_id
				FOR UPDATE
				""")
			.ToListAsync(cancellationToken);
	}

	/// <summary>
	/// Step 5, profile axis. Ordered by the same <c>(user_account_id, profile_id)</c> key as the
	/// account axis: the two axes overlap on at most a shared subset, and because both walk that
	/// subset in the same order, neither can hold a shared row the other needs earlier.
	/// </summary>
	internal static async Task<List<UserAccountProfile>>
		LockAndMaterializeLinksForProfilesAsync(
			AppDbContext dbContext,
			IReadOnlyCollection<Guid> profileIds,
			CancellationToken cancellationToken
		) {
		if (profileIds.Count == 0) {
			return [];
		}

		var ids = profileIds.Distinct().ToArray();

		return await dbContext.UserAccountProfile
			.FromSql($"""
				SELECT * FROM user_account_profiles
				WHERE profile_id = ANY({ids})
				ORDER BY user_account_id, profile_id
				FOR UPDATE
				""")
			.ToListAsync(cancellationToken);
	}
}
