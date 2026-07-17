
using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
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
	/// U. Removing the identity mutex from either A or B makes this spec fail on the final
	/// assertion.
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

		await Task.WhenAll(suspendTask, assignTask, removalTask);

		(await CountActiveAdminsAsync(targetTenantId)).Should().BeGreaterThan(
			0,
			"a membership added behind global suspension's enumeration must not let the "
			+ "tenant's last admin be removed and then suspended"
		);
	}

	// ---------------------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------------------

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
		AccountLevel level
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
