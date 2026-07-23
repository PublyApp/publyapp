
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
	private readonly ApiFixture _fixture;

	public TenantMembershipLockOrderSpec(ApiFixture fixture) {
		_fixture = fixture;
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
		var (tenantId, userId, userAccountId) = await SeedTenantWithMemberAsync();
		var profileId = await CreateTenantProfileAsync(tenantId);

		await using var assignScope = _fixture.Factory.Services.CreateAsyncScope();
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
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.RemoveUserFromTenantAsync(tenantId, userId);
		});

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			_fixture.Factory.Services,
			1,
			assignPid
		);

		await assignTx.CommitAsync();

		(await removalTask).Should().BeOfType<RemoveUserFromTenantResult.Success>();

		(await CountLinksAsync(userAccountId)).Should().Be(
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
		var (tenantId, userId, userAccountId) = await SeedTenantWithMemberAsync();
		var profileId = await CreateTenantProfileAsync(tenantId);

		await using var assignScope = _fixture.Factory.Services.CreateAsyncScope();
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
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.BulkRemoveUsersFromTenantAsync(
				new BulkRemoveUsersFromTenantArgs(tenantId, [userId])
			);
		});

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			_fixture.Factory.Services,
			1,
			assignPid
		);

		await assignTx.CommitAsync();

		var result = await removalTask;
		result.SucceededCount.Should().Be(1);

		(await CountLinksAsync(userAccountId)).Should().Be(
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
		var (tenantId, userId, userAccountId) = await SeedTenantWithMemberAsync();
		var profileId = await CreateTenantProfileAsync(tenantId);
		await InsertLinkAsync(userAccountId, profileId);

		await using var barrierScope = _fixture.Factory.Services.CreateAsyncScope();
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
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantProfileAsStaffService>();
			return await service.DeleteTenantProfileAsync(
				new DeleteTenantProfileArgs(tenantId, profileId)
			);
		});

		var removalTask = Task.Run(async () => {
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.RemoveUserFromTenantAsync(tenantId, userId);
		});

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			_fixture.Factory.Services,
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

		(await CountLinksAsync(userAccountId)).Should().Be(0);
	}

	/// <summary>
	/// The batched equivalent: bulk profile delete versus bulk member removal over the same link.
	/// Both axes lock the junction by the same <c>(user_account_id, profile_id)</c> key, so they
	/// serialize rather than deadlock.
	/// </summary>
	[Fact]
	public async Task ItShouldLetBulkProfileDeleteAndBulkRemovalBothSucceedForTheSameLinks() {
		var (tenantId, userId, userAccountId) = await SeedTenantWithMemberAsync();
		var firstProfileId = await CreateTenantProfileAsync(tenantId);
		var secondProfileId = await CreateTenantProfileAsync(tenantId);
		await InsertLinkAsync(userAccountId, firstProfileId);
		await InsertLinkAsync(userAccountId, secondProfileId);

		await using var barrierScope = _fixture.Factory.Services.CreateAsyncScope();
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
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
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
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.BulkRemoveUsersFromTenantAsync(
				new BulkRemoveUsersFromTenantArgs(tenantId, [userId])
			);
		});

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			_fixture.Factory.Services,
			2,
			barrierPid
		);

		await barrierTx.RollbackAsync();

		var deleteResult = await profileDeleteTask;
		var removalResult = await removalTask;

		deleteResult.SucceededCount.Should().Be(2);
		removalResult.SucceededCount.Should().Be(1);

		(await CountLinksAsync(userAccountId)).Should().Be(0);
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
		var tenantId = await CreateTenantAsync();
		var (firstAdminUserId, _) = await SeedMemberAsync(tenantId, AccountLevel.Admin);
		var (secondAdminUserId, _) = await SeedMemberAsync(tenantId, AccountLevel.Admin);

		await using var barrierScope = _fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();

		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM tenants WHERE id = {tenantId} FOR UPDATE"
		);
		var barrierPid = await PostgresLockBarrier.GetBackendPidAsync(barrierDb);

		var removalTasks = new[] { firstAdminUserId, secondAdminUserId }
			.Select(adminUserId => Task.Run(async () => {
				await using var scope = _fixture.Factory.Services.CreateAsyncScope();
				var service = scope.ServiceProvider
					.GetRequiredService<ITenantUserMembershipService>();
				return await service.RemoveUserFromTenantAsync(tenantId, adminUserId);
			}))
			.ToList();

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			_fixture.Factory.Services,
			2,
			barrierPid
		);

		await barrierTx.RollbackAsync();

		var results = await Task.WhenAll(removalTasks);

		results.Count(r => r is RemoveUserFromTenantResult.Success).Should().Be(1);
		results.Count(r => r is RemoveUserFromTenantResult.CannotRemoveLastAdmin)
			.Should().Be(1);

		(await CountActiveAdminsAsync(tenantId)).Should().Be(
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
		var tenantId = await CreateTenantAsync();
		var (suspendedAdminUserId, _) = await SeedMemberAsync(
			tenantId,
			AccountLevel.Admin
		);
		var (removedAdminUserId, _) = await SeedMemberAsync(tenantId, AccountLevel.Admin);

		await using var barrierScope = _fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();

		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM tenants WHERE id = {tenantId} FOR UPDATE"
		);
		var barrierPid = await PostgresLockBarrier.GetBackendPidAsync(barrierDb);

		var suspensionTask = Task.Run(async () => {
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.SuspendTenantUserAsync(tenantId, suspendedAdminUserId);
		});

		var removalTask = Task.Run(async () => {
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.RemoveUserFromTenantAsync(tenantId, removedAdminUserId);
		});

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			_fixture.Factory.Services,
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

		(await CountActiveAdminsAsync(tenantId)).Should().Be(
			1,
			"the tenant must never be left without an active admin"
		);
	}

	/// <summary>
	/// The cross-path half of the same invariant: removing one admin while demoting the other.
	/// These are different code paths (<c>RemoveUserFromTenantAsync</c> versus
	/// <c>UpdateTenantUserAsync</c>) touching disjoint account rows, so nothing collides — this
	/// is the write skew SSI used to catch, and the shared tenant lock is now what catches it.
	/// A path that skipped the lock would let both through and strand the tenant at zero admins.
	/// </summary>
	[Fact]
	public async Task ItShouldKeepOneActiveAdminWhenAdminRemovalRacesAdminDemotion() {
		var tenantId = await CreateTenantAsync();
		var (removedAdminUserId, _) = await SeedMemberAsync(tenantId, AccountLevel.Admin);
		var (demotedAdminUserId, _) = await SeedMemberAsync(tenantId, AccountLevel.Admin);

		await using var barrierScope = _fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();

		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM tenants WHERE id = {tenantId} FOR UPDATE"
		);
		var barrierPid = await PostgresLockBarrier.GetBackendPidAsync(barrierDb);

		var removalTask = Task.Run(async () => {
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.RemoveUserFromTenantAsync(tenantId, removedAdminUserId);
		});

		var demotionTask = Task.Run(async () => {
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.UpdateTenantUserAsync(
				tenantId,
				demotedAdminUserId,
				new UpdateTenantUserDocument {
					Level = UserAccount.GetLevelDescription(AccountLevel.User)
				}
			);
		});

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			_fixture.Factory.Services,
			2,
			barrierPid
		);

		await barrierTx.RollbackAsync();

		var removalResult = await removalTask;
		var demotionResult = await demotionTask;

		var removalWon = removalResult is RemoveUserFromTenantResult.Success;
		var demotionWon = demotionResult is UpdateTenantUserResult.Success;

		// Exactly one may win; the loser must be refused by the last-admin guard.
		(removalWon && demotionWon).Should().BeFalse(
			"removal and demotion must not both strip the tenant's last admins"
		);

		(await CountActiveAdminsAsync(tenantId)).Should().Be(
			1,
			"the tenant must never be left without an active admin"
		);
	}

	/// <summary>
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
		var sourceTenantId = await CreateTenantAsync();
		var targetTenantId = await CreateTenantAsync();

		// U: active, non-admin identity in S only.
		var (suspendedUserId, _) = await SeedMemberAsync(sourceTenantId, AccountLevel.User);
		// S keeps its own admin so U's membership there is incidental.
		_ = await SeedMemberAsync(sourceTenantId, AccountLevel.Admin);
		// T: exactly one active Admin, X.
		var (adminUserId, _) = await SeedMemberAsync(targetTenantId, AccountLevel.Admin);

		await using var barrierScope = _fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();

		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM users WHERE id = {suspendedUserId} FOR NO KEY UPDATE"
		);
		var barrierPid = await PostgresLockBarrier.GetBackendPidAsync(barrierDb);

		// A — global suspension of U.
		var suspendTask = Task.Run(async () => {
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserIdentityService>();
			return await service.SuspendTenantUserIdentityForStaffAsync(suspendedUserId);
		});

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			_fixture.Factory.Services,
			1,
			barrierPid
		);

		// B — make U an Admin of T. Without the identity mutex this slips in behind A's
		// enumeration; with it, B parks behind A.
		var assignTask = Task.Run(async () => {
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserCompanyMembershipService>();
			return await service.AssignTenantUserCompaniesForStaffAsync(
				new AssignTenantUserCompaniesArgs(
					suspendedUserId,
					[targetTenantId],
					AccountLevel.Admin
				)
			);
		});

		await PostgresLockBarrier.WaitUntilSettledAsync(
			_fixture.Factory.Services,
			assignTask,
			barrierPid,
			2
		);

		// C — remove T's original admin X. Never blocked by the barrier: it only reads U's row.
		var removalTask = Task.Run(async () => {
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.RemoveUserFromTenantAsync(targetTenantId, adminUserId);
		});

		await PostgresLockBarrier.WaitUntilSettledAsync(
			_fixture.Factory.Services,
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

		(await CountActiveAdminsAsync(targetTenantId)).Should().BeGreaterThan(
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
		var tenantId = await CreateTenantAsync();
		_ = await SeedMemberAsync(tenantId, AccountLevel.Admin);
		var (userId, userAccountId) = await SeedMemberAsync(
			tenantId,
			AccountLevel.User,
			isDeleted: true
		);

		await using var barrierScope = _fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();

		// FOR NO KEY UPDATE conflicts with the mutex's FOR UPDATE, but not with the FOR KEY
		// SHARE an insert would take — so only an explicit mutex can park this restore.
		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM users WHERE id = {userId} FOR NO KEY UPDATE"
		);
		var barrierPid = await PostgresLockBarrier.GetBackendPidAsync(barrierDb);

		var restoreTask = Task.Run(async () => {
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserCompanyMembershipService>();
			return await service.AssignTenantUserCompaniesForStaffAsync(
				new AssignTenantUserCompaniesArgs(userId, [tenantId], AccountLevel.Admin)
			);
		});

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			_fixture.Factory.Services,
			1,
			barrierPid
		);

		// Parked *before* mutating: the membership it would resurrect is still removed.
		(await IsAccountDeletedAsync(userAccountId)).Should().BeTrue(
			"the restore must take the identity mutex before it touches the account"
		);

		await barrierTx.RollbackAsync();

		var result = await restoreTask;
		result.SucceededCount.Should().Be(1);
		(await IsAccountDeletedAsync(userAccountId)).Should().BeFalse();
	}

	/// <summary>
	/// Demotion always writes the users row (<c>user.UpdatedAt</c>), so its <c>SaveChanges</c>
	/// needs a lock on <c>users(U)</c>. It must therefore hold that lock <i>before</i> the tenant
	/// mutex, or it forms the <c>tenants → users</c> edge the canonical order forbids and
	/// deadlocks against global suspension going the other way.
	/// <para>
	/// The NOWAIT probe is what makes this deterministic: while demotion is parked on the
	/// identity mutex, the tenant row must still be lockable by anyone else — proving demotion
	/// has not taken it yet. With the tenant lock taken first, demotion instead parks on its
	/// users write while holding the tenant row, and the probe fails.
	/// </para>
	/// </summary>
	[Fact]
	public async Task ItShouldTakeTheIdentityMutexBeforeTheTenantMutexWhenDemoting() {
		var tenantId = await CreateTenantAsync();
		var (demotedUserId, _) = await SeedMemberAsync(tenantId, AccountLevel.Admin);
		_ = await SeedMemberAsync(tenantId, AccountLevel.Admin);

		await using var barrierScope = _fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();

		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM users WHERE id = {demotedUserId} FOR NO KEY UPDATE"
		);
		var barrierPid = await PostgresLockBarrier.GetBackendPidAsync(barrierDb);

		var demotionTask = Task.Run(async () => {
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.UpdateTenantUserAsync(
				tenantId,
				demotedUserId,
				new UpdateTenantUserDocument {
					Level = UserAccount.GetLevelDescription(AccountLevel.User)
				}
			);
		});

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			_fixture.Factory.Services,
			1,
			barrierPid
		);

		(await IsTenantRowLockableAsync(tenantId)).Should().BeTrue(
			"demotion must park on the identity mutex before it takes the tenant mutex; if it "
			+ "holds the tenant row while waiting for users(U), it deadlocks against global "
			+ "suspension, which takes those two locks in the opposite order"
		);

		await barrierTx.RollbackAsync();

		(await demotionTask).Should().BeOfType<UpdateTenantUserResult.Success>();
	}

	/// <summary>
	/// The cross-class pairing the corrected order exists for: global suspension holds
	/// <c>users(U)</c> and wants <c>tenants(T)</c>; demotion must want them the same way round.
	/// Both must terminate — no <c>40P01</c> — and T must keep an active admin.
	/// <para>
	/// Honest note on strength: under the inverted order this schedule deadlocks only when
	/// demotion happens to win the tenant row after release, so its red is probabilistic. The
	/// deterministic control for the ordering is the NOWAIT probe spec above; this one is the
	/// end-to-end regression guard.
	/// </para>
	/// </summary>
	[Fact]
	public async Task ItShouldNotDeadlockWhenGlobalSuspensionRacesDemotion() {
		var tenantId = await CreateTenantAsync();
		var (suspendedUserId, _) = await SeedMemberAsync(tenantId, AccountLevel.Admin);
		_ = await SeedMemberAsync(tenantId, AccountLevel.Admin);

		await using var barrierScope = _fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();

		// Park both on the tenant row: global suspension gets there holding users(U).
		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM tenants WHERE id = {tenantId} FOR UPDATE"
		);
		var barrierPid = await PostgresLockBarrier.GetBackendPidAsync(barrierDb);

		var suspendTask = Task.Run(async () => {
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserIdentityService>();
			return await service.SuspendTenantUserIdentityForStaffAsync(suspendedUserId);
		});

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			_fixture.Factory.Services,
			1,
			barrierPid
		);

		var demotionTask = Task.Run(async () => {
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.UpdateTenantUserAsync(
				tenantId,
				suspendedUserId,
				new UpdateTenantUserDocument {
					Level = UserAccount.GetLevelDescription(AccountLevel.User)
				}
			);
		});

		await PostgresLockBarrier.WaitUntilSettledAsync(
			_fixture.Factory.Services,
			demotionTask,
			barrierPid,
			2
		);

		await barrierTx.RollbackAsync();

		// Task.WhenAll rethrows a PostgresException 40P01 if the pair deadlocked.
		await Task.WhenAll(suspendTask, demotionTask);

		(await CountActiveAdminsAsync(tenantId)).Should().BeGreaterThan(0);
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
		var tenantId = await CreateTenantAsync();
		_ = await SeedMemberAsync(tenantId, AccountLevel.Admin);
		var (memberUserId, memberAccountId) = await SeedMemberAsync(tenantId, AccountLevel.User);

		await using var barrierScope = _fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();

		// FOR UPDATE conflicts with both the fix's explicit FOR UPDATE identity lock and the
		// FOR NO KEY UPDATE that a bare users-row write takes — so it parks the update either way.
		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM users WHERE id = {memberUserId} FOR UPDATE"
		);
		var barrierPid = await PostgresLockBarrier.GetBackendPidAsync(barrierDb);

		var updateTask = Task.Run(async () => {
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
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
			_fixture.Factory.Services,
			1,
			barrierPid
		);

		(await IsUserAccountRowLockableAsync(memberAccountId)).Should().BeTrue(
			"a non-demoting update must take users(U) before its SaveChanges locks "
			+ "user_accounts; the reverse order deadlocks against a demotion holding users(U) "
			+ "and wanting user_accounts"
		);

		await barrierTx.RollbackAsync();

		(await updateTask).Should().BeOfType<UpdateTenantUserResult.Success>();
	}

	/// <summary>
	/// The end-to-end pairing the identity mutex on the non-demoting path exists for: an ordinary
	/// PATCH of a member races a demotion of the <i>same</i> member. Both must terminate — no
	/// <c>40P01</c> — and the tenant must keep an active admin.
	/// <para>
	/// This red is deterministic, not probabilistic. The demotion is parked on the tenant row
	/// while holding <c>users(U)</c>; the non-demoting PATCH then locks <c>user_accounts</c>
	/// (nothing else holds it) and blocks on <c>users(U)</c>. On release the demotion's
	/// <c>SaveChanges</c> wants <c>user_accounts</c>, forming the cycle. With the fix the PATCH
	/// takes <c>users(U)</c> first, so it queues behind the demotion instead of grabbing
	/// <c>user_accounts</c>.
	/// </para>
	/// </summary>
	[Fact]
	public async Task ItShouldNotDeadlockWhenNonDemotingUpdateRacesDemotion() {
		var tenantId = await CreateTenantAsync();
		var (memberUserId, _) = await SeedMemberAsync(tenantId, AccountLevel.Admin);
		// A second admin so the demotion is permitted to succeed.
		_ = await SeedMemberAsync(tenantId, AccountLevel.Admin);

		await using var barrierScope = _fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();

		// Park the demotion on the tenant row: it reaches this point holding users(U).
		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM tenants WHERE id = {tenantId} FOR UPDATE"
		);
		var barrierPid = await PostgresLockBarrier.GetBackendPidAsync(barrierDb);

		// B — demotion. Takes users(U), then parks on the tenant row the barrier holds.
		var demotionTask = Task.Run(async () => {
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.UpdateTenantUserAsync(
				tenantId,
				memberUserId,
				new UpdateTenantUserDocument {
					Level = UserAccount.GetLevelDescription(AccountLevel.User)
				}
			);
		});

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			_fixture.Factory.Services,
			1,
			barrierPid
		);

		// A — an ordinary non-demoting PATCH of the SAME member.
		var updateTask = Task.Run(async () => {
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
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

		// A is now blocked on users(U) — transitively behind the barrier through the demotion.
		await PostgresLockBarrier.WaitUntilBlockedAsync(
			_fixture.Factory.Services,
			2,
			barrierPid
		);

		await barrierTx.RollbackAsync();

		// Task.WhenAll rethrows PostgresException 40P01 if the two SaveChanges deadlocked. With
		// the identity mutex on both paths they serialize on users(U) and both terminate.
		var demotionResult = await demotionTask;
		var updateResult = await updateTask;

		demotionResult.Should().BeOfType<UpdateTenantUserResult.Success>();
		updateResult.Should().BeOfType<UpdateTenantUserResult.Success>();

		(await CountActiveAdminsAsync(tenantId)).Should().BeGreaterThan(
			0,
			"the tenant keeps its second admin, and neither request may 40P01 into a 500"
		);
	}

	/// <summary>
	/// Bulk versus single removal for an overlapping account set. Both take
	/// <c>tenants → user_accounts → user_account_profiles</c>, all id-ordered, so they serialize
	/// on the tenant row and neither can hold a row the other needs earlier.
	/// </summary>
	[Fact]
	public async Task ItShouldNotDeadlockWhenBulkRemovalRacesSingleRemoval() {
		var tenantId = await CreateTenantAsync();
		_ = await SeedMemberAsync(tenantId, AccountLevel.Admin);
		var (firstUserId, firstAccountId) = await SeedMemberAsync(tenantId, AccountLevel.User);
		var (secondUserId, secondAccountId) = await SeedMemberAsync(tenantId, AccountLevel.User);

		var profileId = await CreateTenantProfileAsync(tenantId);
		await InsertLinkAsync(firstAccountId, profileId);
		await InsertLinkAsync(secondAccountId, profileId);

		await using var barrierScope = _fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();

		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM tenants WHERE id = {tenantId} FOR UPDATE"
		);
		var barrierPid = await PostgresLockBarrier.GetBackendPidAsync(barrierDb);

		var bulkTask = Task.Run(async () => {
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.BulkRemoveUsersFromTenantAsync(
				new BulkRemoveUsersFromTenantArgs(tenantId, [firstUserId, secondUserId])
			);
		});

		var singleTask = Task.Run(async () => {
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var service = scope.ServiceProvider
				.GetRequiredService<ITenantUserMembershipService>();
			return await service.RemoveUserFromTenantAsync(tenantId, firstUserId);
		});

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			_fixture.Factory.Services,
			2,
			barrierPid
		);

		await barrierTx.RollbackAsync();

		// Rethrows on 40P01. Which one wins the overlapping account is deliberately not
		// asserted; the terminal state is what must hold either way.
		await Task.WhenAll(bulkTask, singleTask);

		(await CountLinksAsync(firstAccountId)).Should().Be(0);
		(await CountLinksAsync(secondAccountId)).Should().Be(0);
		(await IsAccountDeletedAsync(firstAccountId)).Should().BeTrue();
		(await IsAccountDeletedAsync(secondAccountId)).Should().BeTrue();
	}

	// ---------------------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------------------

	/// <summary>
	/// NOWAIT probe: is the tenant row currently free? Deterministic — PostgreSQL raises 55P03
	/// immediately rather than blocking, so this reports lock state without a timing guess.
	/// </summary>
	private async Task<bool> IsTenantRowLockableAsync(Guid tenantId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var transaction = await dbContext.Database.BeginTransactionAsync();

		try {
			_ = await dbContext.Database.ExecuteSqlAsync(
				$"SELECT 1 FROM tenants WHERE id = {tenantId} FOR UPDATE NOWAIT"
			);
			return true;
		} catch (Npgsql.PostgresException ex) when (ex.SqlState == "55P03") {
			return false;
		} finally {
			await transaction.RollbackAsync();
		}
	}

	/// <summary>
	/// NOWAIT probe for a <c>user_accounts</c> row: same deterministic 55P03 semantics as
	/// <see cref="IsTenantRowLockableAsync"/>. Reports whether the row is currently unlocked.
	/// </summary>
	private async Task<bool> IsUserAccountRowLockableAsync(Guid userAccountId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
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

	private async Task<bool> IsAccountDeletedAsync(Guid userAccountId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
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

	private async Task<Guid> CreateTenantAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
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

	private async Task<(Guid UserId, Guid UserAccountId)> SeedMemberAsync(
		Guid tenantId,
		AccountLevel level,
		bool isDeleted = false
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
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
			Level = level,
			Status = AccountStatus.Active,
		};

		_ = dbContext.UserAccount.Add(account);
		_ = await dbContext.SaveChangesAsync();

		if (isDeleted) {
			account.IsDeleted = true;
			account.DeletedAt = DateTime.UtcNow;
			_ = await dbContext.SaveChangesAsync();
		}

		return (user.GetRequiredId(), account.GetRequiredId());
	}

	private async Task<(Guid TenantId, Guid UserId, Guid UserAccountId)>
		SeedTenantWithMemberAsync() {
		var tenantId = await CreateTenantAsync();

		// A live admin so removing the member under test never trips the last-admin guard.
		_ = await SeedMemberAsync(tenantId, AccountLevel.Admin);

		var (userId, userAccountId) = await SeedMemberAsync(tenantId, AccountLevel.User);
		return (tenantId, userId, userAccountId);
	}

	private async Task<Guid> CreateTenantProfileAsync(Guid tenantId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
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

	private async Task InsertLinkAsync(Guid userAccountId, Guid profileId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		_ = dbContext.UserAccountProfile.Add(new UserAccountProfile {
			UserAccountId = userAccountId,
			ProfileId = profileId,
		});
		_ = await dbContext.SaveChangesAsync();
	}

	private async Task<int> CountLinksAsync(Guid userAccountId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.UserAccountProfile
			.Where(link => link.UserAccountId == userAccountId)
			.CountAsync();
	}

	private async Task<int> CountActiveAdminsAsync(Guid tenantId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await (
			from ua in dbContext.UserAccount
			from u in dbContext.User
			where u.Id == ua.UserId
				&& ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& ua.Level == AccountLevel.Admin
				&& ua.Status != AccountStatus.Suspended
				&& !ua.IsDeleted
				&& !u.IsDeleted
				&& u.Status != UserStatus.Suspended
			select ua.Id
		).CountAsync();
	}
}
