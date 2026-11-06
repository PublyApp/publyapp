
using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Profiles.Services;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Services;

/// <summary>
/// Protocol specs for <see cref="TenantMembershipLockOrder"/>, exercising the REAL service paths
/// (not raw SQL stand-ins) under barrier-controlled interleavings.
/// </summary>
public sealed class TenantMembershipLockOrderSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;

	public TenantMembershipLockOrderSpec(ApiFixture fixture) {
		this._Fixture = fixture;
	}

	// ---------------------------------------------------------------------------------------
	// Blocker: a removal must see an assignment committed while it waited for the account lock.
	// ---------------------------------------------------------------------------------------

	/// <summary>
	/// The exact reviewed interleaving: an assign holds the account row lock and its uncommitted
	/// link; the REAL single-removal path parks on that account lock; the assign commits; the
	/// removal proceeds and must see and delete the link.
	/// <para>
	/// This is precisely what a frozen snapshot breaks. Under SERIALIZABLE the removal's snapshot
	/// is fixed at its first statement — before the assign committed — and waiting on the row
	/// lock does not refresh it, so its junction read returns nothing and the link survives
	/// behind a removed membership. Restoring SERIALIZABLE on
	/// <c>RemoveUserFromTenantAsync</c> makes this spec fail on the final assertion.
	/// </para>
	/// </summary>
	[Fact]
	public async Task ItShouldDeleteLinkCommittedWhileSingleRemovalWaitedForTheAccountLock() {
		var (tenantId, userId, userAccountId) = await this._SeedTenantWithMemberAsync();
		var profileId = await this._CreateTenantProfileAsync(tenantId);

		await using var assignScope = this._Fixture.Factory.Services.CreateAsyncScope();
		var assignDb = assignScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var assignTx = await assignDb.Database.BeginTransactionAsync();

		// Emulate the assign path's own steps: lock the account row, then insert the link, and
		// hold both uncommitted.
		_ = await assignDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM user_accounts WHERE id = {userAccountId} FOR UPDATE"
		);
		_ = await assignDb.Database.ExecuteSqlAsync(
			$"""
			INSERT INTO user_account_profiles (user_account_id, profile_id, created_at, updated_at)
			VALUES ({userAccountId}, {profileId}, NOW(), NOW())
			"""
		);
		var assignPid = await PostgresLockBarrier.GetBackendPidAsync(assignDb);

		var removalTask = Task.Run(async () => {
			await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.RemoveUserFromTenantAsync(tenantId, userId);
		});

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			this._Fixture.Factory.Services,
			1,
			assignPid
		);

		await assignTx.CommitAsync();

		(await removalTask).Should().BeOfType<RemoveUserFromTenantResult.Success>();

		(await this._CountLinksAsync(userAccountId)).Should().Be(
			0,
			"the removal must observe and purge a link committed while it waited on the lock"
		);
	}

	/// <summary>
	/// Same interleaving against the REAL bulk-removal path, which resolves its accounts before
	/// taking the account lock and is therefore the more exposed of the two.
	/// </summary>
	[Fact]
	public async Task ItShouldDeleteLinkCommittedWhileBulkRemovalWaitedForTheAccountLock() {
		var (tenantId, userId, userAccountId) = await this._SeedTenantWithMemberAsync();
		var profileId = await this._CreateTenantProfileAsync(tenantId);

		await using var assignScope = this._Fixture.Factory.Services.CreateAsyncScope();
		var assignDb = assignScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var assignTx = await assignDb.Database.BeginTransactionAsync();

		_ = await assignDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM user_accounts WHERE id = {userAccountId} FOR UPDATE"
		);
		_ = await assignDb.Database.ExecuteSqlAsync(
			$"""
			INSERT INTO user_account_profiles (user_account_id, profile_id, created_at, updated_at)
			VALUES ({userAccountId}, {profileId}, NOW(), NOW())
			"""
		);
		var assignPid = await PostgresLockBarrier.GetBackendPidAsync(assignDb);

		var removalTask = Task.Run(async () => {
			await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.BulkRemoveUsersFromTenantAsync(
				new BulkRemoveUsersFromTenantArgs(tenantId, [userId])
			);
		});

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			this._Fixture.Factory.Services,
			1,
			assignPid
		);

		await assignTx.CommitAsync();

		var result = await removalTask;
		result.SucceededCount.Should().Be(1);

		(await this._CountLinksAsync(userAccountId)).Should().Be(
			0,
			"the bulk removal must observe and purge a link committed while it waited"
		);
	}

	// ---------------------------------------------------------------------------------------
	// Major: cross-axis cleanup. Both real paths target the same junction row and both must win.
	// ---------------------------------------------------------------------------------------

	/// <summary>
	/// Profile deletion and member removal race for the same link. Both REAL paths park on the
	/// junction row, then run one after the other; the loser must observe the winner's delete and
	/// succeed on the survivors instead of issuing a tracked delete for a row that is already
	/// gone (which EF reports as <c>DbUpdateConcurrencyException</c>, rolling the loser's
	/// transaction back into a 500).
	/// </summary>
	[Fact]
	public async Task ItShouldLetProfileDeleteAndMemberRemovalBothSucceedForTheSameLink() {
		var (tenantId, userId, userAccountId) = await this._SeedTenantWithMemberAsync();
		var profileId = await this._CreateTenantProfileAsync(tenantId);
		await this._InsertLinkAsync(userAccountId, profileId);

		await using var barrierScope = this._Fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();

		// Park both cleanups on the shared junction row.
		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"""
			SELECT 1 FROM user_account_profiles
			WHERE user_account_id = {userAccountId} AND profile_id = {profileId}
			FOR UPDATE
			"""
		);
		var barrierPid = await PostgresLockBarrier.GetBackendPidAsync(barrierDb);

		var profileDeleteTask = Task.Run(async () => {
			await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantProfileAsStaffService>();
			return await service.DeleteTenantProfileAsync(
				new DeleteTenantProfileArgs(tenantId, profileId)
			);
		});

		var removalTask = Task.Run(async () => {
			await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.RemoveUserFromTenantAsync(tenantId, userId);
		});

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			this._Fixture.Factory.Services,
			2,
			barrierPid
		);

		// Release without changing anything: the two real paths now serialize against each other.
		await barrierTx.RollbackAsync();

		var deleteResult = await profileDeleteTask;
		var removalResult = await removalTask;

		deleteResult.Should().BeOfType<DeleteTenantProfileResult.Success>(
			"the profile delete must not lose to the concurrent member removal"
		);
		removalResult.Should().BeOfType<RemoveUserFromTenantResult.Success>(
			"the member removal must not lose to the concurrent profile delete"
		);

		(await this._CountLinksAsync(userAccountId)).Should().Be(0);
	}

	/// <summary>
	/// The batched equivalent: bulk profile delete versus bulk member removal over the same link.
	/// Both axes lock the junction by the same <c>(user_account_id, profile_id)</c> key, so they
	/// serialize rather than deadlock.
	/// </summary>
	[Fact]
	public async Task ItShouldLetBulkProfileDeleteAndBulkRemovalBothSucceedForTheSameLinks() {
		var (tenantId, userId, userAccountId) = await this._SeedTenantWithMemberAsync();
		var firstProfileId = await this._CreateTenantProfileAsync(tenantId);
		var secondProfileId = await this._CreateTenantProfileAsync(tenantId);
		await this._InsertLinkAsync(userAccountId, firstProfileId);
		await this._InsertLinkAsync(userAccountId, secondProfileId);

		await using var barrierScope = this._Fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();

		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"""
			SELECT 1 FROM user_account_profiles
			WHERE user_account_id = {userAccountId}
			ORDER BY user_account_id, profile_id
			FOR UPDATE
			"""
		);
		var barrierPid = await PostgresLockBarrier.GetBackendPidAsync(barrierDb);

		var profileDeleteTask = Task.Run(async () => {
			await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantProfileAsStaffService>();
			return await service.BulkDeleteTenantProfilesAsync(
				new BulkDeleteTenantProfilesArgs(
					tenantId,
					[firstProfileId, secondProfileId]
				)
			);
		});

		var removalTask = Task.Run(async () => {
			await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.BulkRemoveUsersFromTenantAsync(
				new BulkRemoveUsersFromTenantArgs(tenantId, [userId])
			);
		});

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			this._Fixture.Factory.Services,
			2,
			barrierPid
		);

		await barrierTx.RollbackAsync();

		var deleteResult = await profileDeleteTask;
		var removalResult = await removalTask;

		deleteResult.SucceededCount.Should().Be(2);
		removalResult.SucceededCount.Should().Be(1);

		(await this._CountLinksAsync(userAccountId)).Should().Be(0);
	}

	// ---------------------------------------------------------------------------------------
	// The last-admin invariant must survive the move off SERIALIZABLE.
	// ---------------------------------------------------------------------------------------

	/// <summary>
	/// Two admins, two concurrent removals, one free slot for failure: the tenant must keep an
	/// active admin. Both REAL removals park on the tenant row lock — the mutex that replaced
	/// SSI — so they count admins one after the other: the winner sees 2 and removes, the loser
	/// re-counts under a fresh snapshot, sees 1, and refuses.
	/// <para>
	/// Deleting the tenant lock from the removal path makes this fail deterministically: both
	/// removals then count 2 concurrently and both succeed, leaving the tenant with zero active
	/// admins — the write skew SERIALIZABLE used to catch.
	/// </para>
	/// </summary>
	[Fact]
	public async Task ItShouldKeepOneActiveAdminWhenTwoAdminRemovalsRaceForTheLastPair() {
		var tenantId = await this._CreateTenantAsync();
		var (firstAdminUserId, _) = await this._SeedMemberAsync(tenantId, fullAccess: true);
		var (secondAdminUserId, _) = await this._SeedMemberAsync(tenantId, fullAccess: true);

		await using var barrierScope = this._Fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();

		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM tenants WHERE id = {tenantId} FOR UPDATE"
		);
		var barrierPid = await PostgresLockBarrier.GetBackendPidAsync(barrierDb);

		var removalTasks = new[] { firstAdminUserId, secondAdminUserId }
			.Select(adminUserId => Task.Run(async () => {
				await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
				var service = scope.ServiceProvider
					.GetRequiredService<ITenantUserMembershipService>();
				return await service.RemoveUserFromTenantAsync(tenantId, adminUserId);
			}))
			.ToList();

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			this._Fixture.Factory.Services,
			2,
			barrierPid
		);

		await barrierTx.RollbackAsync();

		var results = await Task.WhenAll(removalTasks);

		results.Count(r => r is RemoveUserFromTenantResult.Success).Should().Be(1);
		results.Count(r => r is RemoveUserFromTenantResult.CannotRemoveLastAdmin)
			.Should().Be(1);

		(await this._CountActiveAdminsAsync(tenantId)).Should().Be(
			1,
			"the tenant must never be left without an active admin"
		);
	}

	/// <summary>
	/// Suspending one admin while removing the other is the same cross-row COUNT invariant as
	/// two removals. Both REAL paths must park on the tenant row lock, then count against fresh
	/// READ COMMITTED snapshots so exactly one wins and the loser returns its last-admin result.
	/// <para>
	/// Deleting the transaction and tenant lock from the suspension path makes this fail
	/// deterministically: suspension no longer parks behind the barrier, so the expected two
	/// blocked requests never materialize. Without the barrier, both paths can count 2 and commit,
	/// leaving the tenant with zero active admins.
	/// </para>
	/// </summary>
	[Fact]
	public async Task ItShouldKeepOneActiveAdminWhenAdminSuspensionRacesAdminRemoval() {
		var tenantId = await this._CreateTenantAsync();
		var (suspendedAdminUserId, _) = await this._SeedMemberAsync(
			tenantId,
			fullAccess: true
		);
		var (removedAdminUserId, _) = await this._SeedMemberAsync(tenantId, fullAccess: true);

		await using var barrierScope = this._Fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();

		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM tenants WHERE id = {tenantId} FOR UPDATE"
		);
		var barrierPid = await PostgresLockBarrier.GetBackendPidAsync(barrierDb);

		var suspensionTask = Task.Run(async () => {
			await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.SuspendTenantUserAsync(tenantId, suspendedAdminUserId);
		});

		var removalTask = Task.Run(async () => {
			await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.RemoveUserFromTenantAsync(tenantId, removedAdminUserId);
		});

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			this._Fixture.Factory.Services,
			2,
			barrierPid
		);

		await barrierTx.RollbackAsync();

		var suspensionResult = await suspensionTask;
		var removalResult = await removalTask;

		var suspensionWon = suspensionResult is SuspendTenantUserResult.Success;
		var removalWon = removalResult is RemoveUserFromTenantResult.Success;

		suspensionWon.Should().NotBe(
			removalWon,
			"exactly one admin-reducing operation must succeed"
		);

		if (suspensionWon) {
			removalResult.Should().BeOfType<RemoveUserFromTenantResult.CannotRemoveLastAdmin>();
		} else {
			suspensionResult.Should()
				.BeOfType<SuspendTenantUserResult.CannotSuspendLastAdmin>();
		}

		(await this._CountActiveAdminsAsync(tenantId)).Should().Be(
			1,
			"the tenant must never be left without an active admin"
		);
	}

	/// <summary>
	/// The cross-path half of the same invariant: removing one full-access holder while the
	/// other is demoted by unassigning the tenant's full-access role. Removal goes through
	/// <c>TenantUserMembershipOperations</c>; demotion goes through
	/// <c>SetTenantProfileUserAsync</c>, which now carries the last-holder guard. Both take the
	/// tenant row lock and then count, so exactly one may win and the tenant keeps a holder.
	/// </summary>
	[Fact]
	public async Task ItShouldKeepOneActiveAdminWhenAdminRemovalRacesAdminDemotion() {
		var tenantId = await this._CreateTenantAsync();
		var (removedAdminUserId, _) = await this._SeedMemberAsync(tenantId, fullAccess: true);
		var (demotedAdminUserId, demotedAdminAccountId) =
			await this._SeedMemberAsync(tenantId, fullAccess: true);

		var ownerProfileId = await this._GetTenantFullAccessProfileIdAsync(tenantId);
		var actorUserId = await StaffUserTestHelper.SeedStaffUserAsync(
			this._Fixture,
			$"lock-order-actor-{Guid.NewGuid():N}@example.com"
		);

		await using var barrierScope = this._Fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();

		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM tenants WHERE id = {tenantId} FOR UPDATE"
		);
		var barrierPid = await PostgresLockBarrier.GetBackendPidAsync(barrierDb);

		var removalTask = Task.Run(async () => {
			await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.RemoveUserFromTenantAsync(tenantId, removedAdminUserId);
		});

		var demotionTask = Task.Run(async () => {
			await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantProfileAsStaffService>();
			return await service.SetTenantProfileUserAsync(new SetTenantProfileUserArgs(
				tenantId,
				ownerProfileId,
				demotedAdminAccountId,
				IsAssigned: false,
				ActorUserId: actorUserId
			));
		});

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			this._Fixture.Factory.Services,
			2,
			barrierPid
		);

		await barrierTx.RollbackAsync();

		var removalResult = await removalTask;
		var demotionResult = await demotionTask;

		var removalWon = removalResult is RemoveUserFromTenantResult.Success;
		var demotionWon = demotionResult is SetTenantProfileUserResult.Success;
		var demotionRefused =
			demotionResult is SetTenantProfileUserResult.LastFullAccessRoleAssignment;

		// Exactly one may win; the loser must be refused by the last-holder guard.
		(removalWon && demotionWon).Should().BeFalse(
			"removal and role unassignment must not both strip the tenant's last full-access holder"
		);
		(removalWon || demotionWon).Should().BeTrue(
			"one of the two paths must be able to run"
		);
		if (removalWon) {
			demotionRefused.Should().BeTrue();
		}

		(await this._CountActiveAdminsAsync(tenantId)).Should().Be(
			1,
			"the tenant must never be left without an active full-access holder"
		);
	}

	/// The identity mutex: a lock set discovered before it is frozen is not a lock set.
	/// Reproduces the exact reviewed three-request schedule.
	/// </summary>
	/// <remarks>
	/// <para>
	/// Valid start state: <c>U</c> is active with a non-admin membership in tenant <c>S</c>;
	/// tenant <c>T</c> has exactly one active Admin <c>X</c>; <c>U</c> is not in <c>T</c>.
	/// </para>
	/// <para>
	/// A <c>FOR NO KEY UPDATE</c> barrier on <c>U</c>'s <c>users</c> row is what makes this
	/// precise. It conflicts with global suspension's own status update (also a no-key update),
	/// parking A at exactly the reviewed point — after its last-admin guard passed, before its
	/// write. It does <b>not</b> conflict with the <c>FOR KEY SHARE</c> that B's membership
	/// insert takes on the same row, so B is free to run — unless the identity mutex
	/// (<c>FOR UPDATE</c>) orders it, which is the whole point of the fix.
	/// </para>
	/// <para>
	/// Unprotected, this schedule ends with T at zero active admins while all three requests
	/// report success: A's guard passed before U was an admin anywhere, B added U as T's Admin
	/// behind A's enumeration, C then counted two admins and removed X, and A finally suspended
	/// U.
	/// </para>
	/// <para>
	/// <b>What this spec does and does not prove.</b> Its result mix detects removal of the
	/// company mutex, and it goes red when the mutex is removed from <i>both</i> sides (the
	/// pre-fix state); what it cannot do is isolate A's own mutex. An earlier revision of this
	/// comment wrongly claimed it detected only the both-sides state:
	/// </para>
	/// <list type="bullet">
	/// <item>
	/// Drop only the company mutex and B's <i>new</i> <c>user_accounts</c> row takes only a
	/// foreign-key <c>FOR KEY SHARE</c> on U, which the barrier's <c>FOR NO KEY UPDATE</c> does
	/// not block — so B commits U as T's Admin before C runs. C then counts U plus X, removes X
	/// and succeeds; A re-enumerates T after release and returns
	/// <c>CannotSuspendLastAdmin</c>. Both diverge from the checked-in expectations (C refused,
	/// A succeeded), so the spec is deterministically <b>red</b>. The direct parking proof for
	/// the company mutex is <see cref="ItShouldParkCompanyRestoreBehindTheIdentityMutex"/>;
	/// this result mix corroborates it.
	/// </item>
	/// <item>
	/// Drop only A's mutex and B stays parked on the barrier, so C still counts one admin and
	/// refuses to remove X. Green — this barrier cannot isolate A's mutex.
	/// </item>
	/// </list>
	/// <para>
	/// The company mutex is isolated instead by
	/// <see cref="ItShouldParkCompanyRestoreBehindTheIdentityMutex"/>, which exercises the
	/// restore branch — an UPDATE that takes no foreign-key lock, so only the explicit mutex can
	/// order it. A's own mutex cannot be isolated by an external barrier at all: the only pause
	/// point between A's guard and its write is the very <c>users</c> row that constitutes the
	/// mutex, so with the fix present this schedule is unreachable by construction. A's mutex is
	/// still required — without it, the company mutex would order B only against A's final
	/// write, leaving A's guard→write window open.
	/// </para>
	/// </remarks>
	[Fact]
	public async Task ItShouldKeepOneActiveAdminWhenCompanyAssignmentRacesGlobalSuspension() {
		var sourceTenantId = await this._CreateTenantAsync();
		var targetTenantId = await this._CreateTenantAsync();

		// U: active, non-admin identity in S only.
		var (suspendedUserId, _) = await this._SeedMemberAsync(sourceTenantId);
		// S keeps its own admin so U's membership there is incidental.
		_ = await this._SeedMemberAsync(sourceTenantId, fullAccess: true);
		// T: exactly one active Admin, X.
		var (adminUserId, _) = await this._SeedMemberAsync(targetTenantId, fullAccess: true);

		await using var barrierScope = this._Fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();

		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM users WHERE id = {suspendedUserId} FOR NO KEY UPDATE"
		);
		var barrierPid = await PostgresLockBarrier.GetBackendPidAsync(barrierDb);

		// A — global suspension of U.
		var suspendTask = Task.Run(async () => {
			await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserIdentityService>();
			return await service.SuspendTenantUserIdentityForStaffAsync(suspendedUserId);
		});

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			this._Fixture.Factory.Services,
			1,
			barrierPid
		);

		// B — make U an Admin of T. Without the identity mutex this slips in behind A's
		// enumeration; with it, B parks behind A.
		var assignTask = Task.Run(async () => {
			await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserCompanyMembershipService>();
			return await service.AssignTenantUserCompaniesForStaffAsync(
				new AssignTenantUserCompaniesArgs(
					suspendedUserId,
					[targetTenantId]
				)
			);
		});

		await PostgresLockBarrier.WaitUntilSettledAsync(
			this._Fixture.Factory.Services,
			assignTask,
			barrierPid,
			2
		);

		// C — remove T's original admin X. Never blocked by the barrier: it only reads U's row.
		var removalTask = Task.Run(async () => {
			await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.RemoveUserFromTenantAsync(targetTenantId, adminUserId);
		});

		await PostgresLockBarrier.WaitUntilSettledAsync(
			this._Fixture.Factory.Services,
			removalTask,
			barrierPid,
			3
		);

		await barrierTx.RollbackAsync();

		var suspendResult = await suspendTask;
		var assignResult = await assignTask;
		var removalResult = await removalTask;

		// C ran while both A and B were parked on the identity mutex, so U was not yet an admin
		// of T and X was still its only one: the removal must have been refused. This is the
		// discriminator that detects a missing company mutex (or both mutexes): without it, B
		// commits U as T's Admin before C runs, C then counts two admins and succeeds, and A
		// finally returns CannotSuspendLastAdmin — each diverging from the expectations below.
		removalResult.Should().BeOfType<RemoveUserFromTenantResult.CannotRemoveLastAdmin>(
			"the last admin of T must not be removable while U's admin membership does not yet "
			+ "exist"
		);
		suspendResult.Should().BeOfType<SuspendTenantUserIdentityResult.Success>();
		assignResult.SucceededCount.Should().Be(1);

		(await this._CountActiveAdminsAsync(targetTenantId)).Should().BeGreaterThan(
			0,
			"a membership added behind global suspension's enumeration must not let the "
			+ "tenant's last admin be removed and then suspended"
		);
	}

	/// <summary>
	/// Isolates the company-side identity mutex, which the three-request spec above cannot.
	/// </summary>
	/// <remarks>
	/// <para>
	/// The <b>restore</b> branch is where that mutex is load-bearing. Creating a membership
	/// inserts a <c>user_accounts</c> row, and PostgreSQL takes a foreign-key
	/// <c>FOR KEY SHARE</c> on the referenced <c>users</c> row for free — so a create is
	/// incidentally ordered against an identity <c>FOR UPDATE</c> even with no explicit mutex.
	/// Restoring a soft-deleted membership is a plain <b>UPDATE of <c>user_accounts</c></b>: it
	/// touches no foreign-key column, takes no lock on <c>users</c> at all, and would commit
	/// straight through an in-flight global suspension's enumeration.
	/// </para>
	/// <para>
	/// Deleting only the company mutex makes this spec fail deterministically: the restore stops
	/// parking, so the barrier wait times out.
	/// </para>
	/// </remarks>
	[Fact]
	public async Task ItShouldParkCompanyRestoreBehindTheIdentityMutex() {
		var tenantId = await this._CreateTenantAsync();
		_ = await this._SeedMemberAsync(tenantId, fullAccess: true);
		var (userId, userAccountId) = await this._SeedMemberAsync(
			tenantId,
			isDeleted: true
		);

		await using var barrierScope = this._Fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();

		// FOR NO KEY UPDATE conflicts with the mutex's FOR UPDATE, but not with the FOR KEY
		// SHARE an insert would take — so only an explicit mutex can park this restore.
		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM users WHERE id = {userId} FOR NO KEY UPDATE"
		);
		var barrierPid = await PostgresLockBarrier.GetBackendPidAsync(barrierDb);

		var restoreTask = Task.Run(async () => {
			await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserCompanyMembershipService>();
			return await service.AssignTenantUserCompaniesForStaffAsync(
				new AssignTenantUserCompaniesArgs(userId, [tenantId])
			);
		});

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			this._Fixture.Factory.Services,
			1,
			barrierPid
		);

		// Parked *before* mutating: the membership it would resurrect is still removed.
		(await this._IsAccountDeletedAsync(userAccountId)).Should().BeTrue(
			"the restore must take the identity mutex before it touches the account"
		);

		await barrierTx.RollbackAsync();

		var result = await restoreTask;
		result.SucceededCount.Should().Be(1);
		(await this._IsAccountDeletedAsync(userAccountId)).Should().BeFalse();
	}

	/// <summary>
	/// A non-demoting PATCH always writes both <c>user_accounts</c> and <c>users</c>
	/// (their <c>UpdatedAt</c>). EF Core 10 finds no FK edge between those updates and orders
	/// them <c>user_accounts</c> before <c>users</c> by table name. So the non-demoting path
	/// must take the identity mutex (<c>users(U)</c>) before its <c>SaveChanges</c> locks
	/// <c>user_accounts</c>, or it inverts the canonical order and deadlocks a concurrent
	/// demotion of the same member — which holds <c>users(U)</c> and then wants
	/// <c>user_accounts</c>.
	/// <para>
	/// The NOWAIT probe makes this deterministic: while the update is parked on the identity
	/// mutex, its <c>user_accounts</c> row must still be lockable — proving it has not written
	/// that row yet. Without the mutex the update's <c>SaveChanges</c> locks <c>user_accounts</c>
	/// first and only then blocks on <c>users(U)</c>, so the probe fails with 55P03.
	/// </para>
	/// </summary>
	[Fact]
	public async Task ItShouldTakeTheIdentityMutexBeforeWritingWhenUpdatingNonDemoting() {
		var tenantId = await this._CreateTenantAsync();
		_ = await this._SeedMemberAsync(tenantId, fullAccess: true);
		var (memberUserId, memberAccountId) = await this._SeedMemberAsync(tenantId);

		await using var barrierScope = this._Fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();

		// FOR UPDATE conflicts with both the fix's explicit FOR UPDATE identity lock and the
		// FOR NO KEY UPDATE that a bare users-row write takes — so it parks the update either way.
		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM users WHERE id = {memberUserId} FOR UPDATE"
		);
		var barrierPid = await PostgresLockBarrier.GetBackendPidAsync(barrierDb);

		var updateTask = Task.Run(async () => {
			await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.UpdateTenantUserAsync(
				tenantId,
				memberUserId,
				new UpdateTenantUserDocument {
					FirstName = PatchField<string?>.Set("Renamed")
				}
			);
		});

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			this._Fixture.Factory.Services,
			1,
			barrierPid
		);

		(await this._IsUserAccountRowLockableAsync(memberAccountId)).Should().BeTrue(
			"a non-demoting update must take users(U) before its SaveChanges locks "
			+ "user_accounts; the reverse order deadlocks against a demotion holding users(U) "
			+ "and wanting user_accounts"
		);

		await barrierTx.RollbackAsync();

		(await updateTask).Should().BeOfType<UpdateTenantUserResult.Success>();
	}

	/// <summary>
	/// Bulk versus single removal for an overlapping account set. Both take
	/// <c>tenants → user_accounts → user_account_profiles</c>, all id-ordered, so they serialize
	/// on the tenant row and neither can hold a row the other needs earlier.
	/// </summary>
	[Fact]
	public async Task ItShouldNotDeadlockWhenBulkRemovalRacesSingleRemoval() {
		var tenantId = await this._CreateTenantAsync();
		_ = await this._SeedMemberAsync(tenantId, fullAccess: true);
		var (firstUserId, firstAccountId) = await this._SeedMemberAsync(tenantId);
		var (secondUserId, secondAccountId) = await this._SeedMemberAsync(tenantId);

		var profileId = await this._CreateTenantProfileAsync(tenantId);
		await this._InsertLinkAsync(firstAccountId, profileId);
		await this._InsertLinkAsync(secondAccountId, profileId);

		await using var barrierScope = this._Fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();

		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM tenants WHERE id = {tenantId} FOR UPDATE"
		);
		var barrierPid = await PostgresLockBarrier.GetBackendPidAsync(barrierDb);

		var bulkTask = Task.Run(async () => {
			await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.BulkRemoveUsersFromTenantAsync(
				new BulkRemoveUsersFromTenantArgs(tenantId, [firstUserId, secondUserId])
			);
		});

		var singleTask = Task.Run(async () => {
			await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.RemoveUserFromTenantAsync(tenantId, firstUserId);
		});

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			this._Fixture.Factory.Services,
			2,
			barrierPid
		);

		await barrierTx.RollbackAsync();

		// Rethrows on 40P01. Which one wins the overlapping account is deliberately not
		// asserted; the terminal state is what must hold either way.
		await Task.WhenAll(bulkTask, singleTask);

		(await this._CountLinksAsync(firstAccountId)).Should().Be(0);
		(await this._CountLinksAsync(secondAccountId)).Should().Be(0);
		(await this._IsAccountDeletedAsync(firstAccountId)).Should().BeTrue();
		(await this._IsAccountDeletedAsync(secondAccountId)).Should().BeTrue();
	}

	// ---------------------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------------------

	/// <summary>
	/// NOWAIT probe for a <c>user_accounts</c> row: deterministic 55P03 semantics. Reports
	/// whether the row is currently unlocked.
	/// </summary>
	private async Task<bool> _IsUserAccountRowLockableAsync(Guid userAccountId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var transaction = await dbContext.Database.BeginTransactionAsync();

		try {
			_ = await dbContext.Database.ExecuteSqlAsync(
				$"SELECT 1 FROM user_accounts WHERE id = {userAccountId} FOR UPDATE NOWAIT"
			);
			return true;
		} catch (Npgsql.PostgresException ex) when (ex.SqlState == "55P03") {
			return false;
		} finally {
			await transaction.RollbackAsync();
		}
	}

	private async Task<bool> _IsAccountDeletedAsync(Guid userAccountId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var isDeleted = await dbContext.UserAccount
			.IgnoreQueryFilters()
			.Where(ua => ua.Id == userAccountId)
			.Select(ua => (bool?)ua.IsDeleted)
			.FirstOrDefaultAsync();

		if (isDeleted is not bool value) {
			throw new InvalidOperationException($"Account {userAccountId} not found");
		}

		return value;
	}

	private async Task<Guid> _CreateTenantAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var suffix = Guid.NewGuid().ToString("N")[..8];
		var tenant = new Tenant {
			Name = $"Lock Order Tenant {suffix}",
			Code = $"lock-order-{suffix}",
			Status = TenantStatus.Active,
			MaxUsers = 50,
		};

		_ = dbContext.Tenant.Add(tenant);
		_ = await dbContext.SaveChangesAsync();

		return tenant.GetRequiredId();
	}

	private async Task<(Guid UserId, Guid UserAccountId)> _SeedMemberAsync(
		Guid tenantId,
		bool fullAccess = false,
		bool isDeleted = false
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var suffix = Guid.NewGuid().ToString("N")[..8];
		var user = new User {
			Email = $"lock-order-{suffix}@example.com",
			Password = "hash",
			FirstName = "Lock",
			LastName = "Order",
			Status = UserStatus.Active,
			IsVerified = true
		};

		_ = dbContext.User.Add(user);
		_ = await dbContext.SaveChangesAsync();

		var account = new UserAccount {
			UserId = user.GetRequiredId(),
			TenantId = tenantId,
			Scope = AccountScope.Tenant,
			Status = AccountStatus.Active,
		};

		_ = dbContext.UserAccount.Add(account);
		_ = await dbContext.SaveChangesAsync();

		if (fullAccess) {
			await FullAccessProfileTestHelper.MakeTenantFullAccessAsync(
				dbContext,
				tenantId,
				account.GetRequiredId()
			);
		}

		if (isDeleted) {
			account.IsDeleted = true;
			account.DeletedAt = DateTime.UtcNow;
			_ = await dbContext.SaveChangesAsync();
		}

		return (user.GetRequiredId(), account.GetRequiredId());
	}

	private async Task<(Guid TenantId, Guid UserId, Guid UserAccountId)>
		_SeedTenantWithMemberAsync() {
		var tenantId = await this._CreateTenantAsync();

		// A live admin so removing the member under test never trips the last-admin guard.
		_ = await this._SeedMemberAsync(tenantId, fullAccess: true);

		var (userId, userAccountId) = await this._SeedMemberAsync(tenantId);
		return (tenantId, userId, userAccountId);
	}

	private async Task<Guid> _CreateTenantProfileAsync(Guid tenantId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var profile = Profile.CreateTenantProfile(
			tenantId,
			name: "Lock Order Profile " + Guid.NewGuid().ToString("N")[..8],
			description: "Profile created for lock order specs"
		);
		profile.ValidateProfileType();

		_ = dbContext.Profile.Add(profile);
		_ = await dbContext.SaveChangesAsync();

		return profile.GetRequiredId();
	}

	private async Task _InsertLinkAsync(Guid userAccountId, Guid profileId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		_ = dbContext.UserAccountProfile.Add(new UserAccountProfile {
			UserAccountId = userAccountId,
			ProfileId = profileId,
		});
		_ = await dbContext.SaveChangesAsync();
	}

	private async Task<int> _CountLinksAsync(Guid userAccountId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.UserAccountProfile
			.Where(link => link.UserAccountId == userAccountId)
			.CountAsync();
	}

	private async Task<Guid> _GetTenantFullAccessProfileIdAsync(Guid tenantId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await FullAccessProfileTestHelper.EnsureTenantProfileAsync(dbContext, tenantId);
	}

	private async Task<int> _CountActiveAdminsAsync(Guid tenantId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await FullAccessRoleQueries.CountActiveTenantFullAccessAsync(
			dbContext,
			tenantId
		);
	}
}
