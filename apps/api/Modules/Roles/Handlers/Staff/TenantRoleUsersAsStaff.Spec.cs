
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Roles.Services;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

/// <summary>
/// Targets for the guard matrix. Each resolves to a role/member pair that both verbs must
/// reject identically.
/// </summary>
public enum TenantRoleUserGuardCase {
	ForeignTenantRole,
	ForeignTenantMember,
	StaffScopeRole,
	StaffScopeAccount,
	DeletedRole,
	DeletedMember,
}

public sealed class TenantRoleUsersAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public TenantRoleUsersAsStaffSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _GetToggleUrl(
		string tenantId,
		string roleId,
		string userAccountId
	) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Roles.ForTenantAsStaff.Users.UpsertFn(roleId, userAccountId)
		);
	}

	// ---------------------------------------------------------------------------------------
	// Authorization matrix
	// ---------------------------------------------------------------------------------------

	[Theory]
	[InlineData("POST")]
	[InlineData("DELETE")]
	public async Task ItShouldReturnUnauthorizedWithoutSession(string verb) {
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);

		using var request = new HttpRequestMessage(
			new HttpMethod(verb),
			TenantRoleUsersAsStaffSpec._GetToggleUrl(
				tenantId.ToString(),
				Guid.NewGuid().ToString(),
				Guid.NewGuid().ToString()
			)
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Theory]
	[InlineData("POST")]
	[InlineData("DELETE")]
	public async Task ItShouldReturnForbiddenForStaffWithNeitherPermission(string verb) {
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var token = await this._AuthClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			new HttpMethod(verb),
			TenantRoleUsersAsStaffSpec._GetToggleUrl(
				tenantId.ToString(),
				Guid.NewGuid().ToString(),
				Guid.NewGuid().ToString()
			)
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	/// <summary>
	/// The route requires BOTH permissions (AND). An actor holding exactly one must still be
	/// refused, otherwise a regression dropping one requirement would go unnoticed.
	/// </summary>
	[Theory]
	[InlineData("POST", true)]
	[InlineData("POST", false)]
	[InlineData("DELETE", true)]
	[InlineData("DELETE", false)]
	public async Task ItShouldReturnForbiddenForStaffWithOnlyOneOfTheRequiredPermissions(
		string verb,
		bool holdsRolesPermission
	) {
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);
		var userAccountId = await this._CreateTenantMemberAsync(tenantId);

		var heldPermission = holdsRolesPermission
			? AppPermissions.Staff.Roles.UPDATE_FOR_TENANT.Key
			: AppPermissions.Staff.Users.UPDATE_FOR_TENANT.Key;

		var token = await this._CreateStaffTokenWithPermissionsAsync("one-perm", heldPermission);

		using var request = new HttpRequestMessage(
			new HttpMethod(verb),
			TenantRoleUsersAsStaffSpec._GetToggleUrl(tenantId.ToString(), roleId.ToString(), userAccountId.ToString())
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

		// The rejection must be authorization, not a silent no-op.
		(await this._CountAssignmentsAsync(userAccountId, roleId)).Should().Be(0);
	}

	/// <summary>
	/// Counterpart to the one-permission specs: holding both must actually work, proving the AND
	/// is exactly right rather than merely restrictive.
	/// </summary>
	[Fact]
	public async Task ItShouldAllowAssignForStaffWithBothRequiredPermissions() {
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);
		var userAccountId = await this._CreateTenantMemberAsync(tenantId);

		var token = await this._CreateStaffTokenWithPermissionsAsync(
			"both-perms",
			AppPermissions.Staff.Roles.UPDATE_FOR_TENANT.Key,
			AppPermissions.Staff.Users.UPDATE_FOR_TENANT.Key
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantRoleUsersAsStaffSpec._GetToggleUrl(tenantId.ToString(), roleId.ToString(), userAccountId.ToString())
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NoContent);

		(await this._CountAssignmentsAsync(userAccountId, roleId)).Should().Be(1);
	}

	// ---------------------------------------------------------------------------------------
	// Malformed input
	// ---------------------------------------------------------------------------------------

	[Theory]
	[InlineData("POST", "not-a-guid", null, null)]
	[InlineData("POST", null, "not-a-guid", null)]
	[InlineData("POST", null, null, "not-a-guid")]
	[InlineData("DELETE", "not-a-guid", null, null)]
	[InlineData("DELETE", null, "not-a-guid", null)]
	[InlineData("DELETE", null, null, "not-a-guid")]
	public async Task ItShouldReturnBadRequestForMalformedIds(
		string verb,
		string? malformedTenantId,
		string? malformedRoleId,
		string? malformedUserAccountId
	) {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);

		using var request = new HttpRequestMessage(
			new HttpMethod(verb),
			TenantRoleUsersAsStaffSpec._GetToggleUrl(
				malformedTenantId ?? tenantId.ToString(),
				malformedRoleId ?? Guid.NewGuid().ToString(),
				malformedUserAccountId ?? Guid.NewGuid().ToString()
			)
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	// ---------------------------------------------------------------------------------------
	// Guard matrix — cross-scope / cross-tenant / dead-entity cases, both verbs
	// ---------------------------------------------------------------------------------------

	[Theory]
	[InlineData("POST", TenantRoleUserGuardCase.ForeignTenantRole)]
	[InlineData("POST", TenantRoleUserGuardCase.ForeignTenantMember)]
	[InlineData("POST", TenantRoleUserGuardCase.StaffScopeRole)]
	[InlineData("POST", TenantRoleUserGuardCase.StaffScopeAccount)]
	[InlineData("POST", TenantRoleUserGuardCase.DeletedRole)]
	[InlineData("POST", TenantRoleUserGuardCase.DeletedMember)]
	[InlineData("DELETE", TenantRoleUserGuardCase.ForeignTenantRole)]
	[InlineData("DELETE", TenantRoleUserGuardCase.ForeignTenantMember)]
	[InlineData("DELETE", TenantRoleUserGuardCase.StaffScopeRole)]
	[InlineData("DELETE", TenantRoleUserGuardCase.StaffScopeAccount)]
	[InlineData("DELETE", TenantRoleUserGuardCase.DeletedRole)]
	[InlineData("DELETE", TenantRoleUserGuardCase.DeletedMember)]
	public async Task ItShouldReturnNotFoundForGuardedTargets(
		string verb,
		TenantRoleUserGuardCase guardCase
	) {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var (roleId, userAccountId) = await this._BuildGuardCaseAsync(tenantId, guardCase);

		var auditCountBefore = await this._CountAuditLogsAsync(roleId);
		var assignmentCountBefore = await this._CountAssignmentsAsync(userAccountId, roleId);

		using var request = new HttpRequestMessage(
			new HttpMethod(verb),
			TenantRoleUsersAsStaffSpec._GetToggleUrl(tenantId.ToString(), roleId.ToString(), userAccountId.ToString())
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);

		// A rejected guard must neither create nor destroy membership, nor fabricate history.
		(await this._CountAssignmentsAsync(userAccountId, roleId))
			.Should().Be(assignmentCountBefore);
		(await this._CountAuditLogsAsync(roleId)).Should().Be(auditCountBefore);
	}

	/// <summary>
	/// Suspension is not removal: staff must still manage a suspended member's roles. The
	/// positive counterpart to the DeletedMember guard case.
	/// </summary>
	[Fact]
	public async Task ItShouldAssignForSuspendedMember() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);
		var userAccountId = await this._CreateTenantMemberAsync(
			tenantId,
			status: AccountStatus.Suspended
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantRoleUsersAsStaffSpec._GetToggleUrl(tenantId.ToString(), roleId.ToString(), userAccountId.ToString())
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NoContent);

		(await this._CountAssignmentsAsync(userAccountId, roleId)).Should().Be(1);
	}

	// ---------------------------------------------------------------------------------------
	// Happy paths, idempotency, audit
	// ---------------------------------------------------------------------------------------

	[Fact]
	public async Task ItShouldAssignMemberToTenantRoleWithAuditEntry() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);
		var userAccountId = await this._CreateTenantMemberAsync(tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantRoleUsersAsStaffSpec._GetToggleUrl(tenantId.ToString(), roleId.ToString(), userAccountId.ToString())
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NoContent);

		(await this._CountAssignmentsAsync(userAccountId, roleId)).Should().Be(1);

		var auditLog = await this._GetLatestAuditLogAsync(
			AuditActions.TenantRoleUserAssigned,
			roleId
		);
		Assert.NotNull(auditLog);
		TenantRoleUsersAsStaffSpec._AssertAuditDetails(auditLog, tenantId, roleId, userAccountId);
	}

	[Fact]
	public async Task ItShouldTreatRepeatedAssignAsIdempotentSuccessWithoutSecondAuditEntry() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);
		var userAccountId = await this._CreateTenantMemberAsync(tenantId);

		await this._AssignAsync(token, tenantId, roleId, userAccountId);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantRoleUsersAsStaffSpec._GetToggleUrl(tenantId.ToString(), roleId.ToString(), userAccountId.ToString())
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NoContent);

		// One membership row, and exactly one audit entry: a no-op must not append history.
		(await this._CountAssignmentsAsync(userAccountId, roleId)).Should().Be(1);
		(await this._CountAuditLogsAsync(roleId, AuditActions.TenantRoleUserAssigned))
			.Should().Be(1);
	}

	[Fact]
	public async Task ItShouldUnassignMemberFromTenantRoleWithAuditEntry() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);
		var userAccountId = await this._CreateTenantMemberAsync(tenantId);

		await this._AssignAsync(token, tenantId, roleId, userAccountId);

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			TenantRoleUsersAsStaffSpec._GetToggleUrl(tenantId.ToString(), roleId.ToString(), userAccountId.ToString())
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NoContent);

		// Unassignment hard-deletes the junction row; the audit entry is the only history.
		(await this._CountAssignmentsAsync(userAccountId, roleId)).Should().Be(0);

		var auditLog = await this._GetLatestAuditLogAsync(
			AuditActions.TenantRoleUserUnassigned,
			roleId
		);
		Assert.NotNull(auditLog);
		TenantRoleUsersAsStaffSpec._AssertAuditDetails(auditLog, tenantId, roleId, userAccountId);
	}

	[Fact]
	public async Task ItShouldTreatUnassignOfUnassignedRoleAsNoOp() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);
		var userAccountId = await this._CreateTenantMemberAsync(tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			TenantRoleUsersAsStaffSpec._GetToggleUrl(tenantId.ToString(), roleId.ToString(), userAccountId.ToString())
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NoContent);

		(await this._CountAssignmentsAsync(userAccountId, roleId)).Should().Be(0);
		(await this._CountAuditLogsAsync(roleId, AuditActions.TenantRoleUserUnassigned))
			.Should().Be(0);
	}

	// ---------------------------------------------------------------------------------------
	// Audit atomicity — the junction is hard-deleted, so the audit row is its only history and
	// must share the junction mutation's transaction.
	// ---------------------------------------------------------------------------------------

	/// <summary>
	/// Direct structural proof of co-commit: PostgreSQL's <c>xmin</c> system column is the id of
	/// the inserting transaction. Equal <c>xmin</c> on the junction row and its audit row means
	/// one transaction wrote both. Nothing timing-dependent about it.
	/// </summary>
	[Fact]
	public async Task ItShouldWriteAssignmentAndAuditEntryInTheSameTransaction() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);
		var userAccountId = await this._CreateTenantMemberAsync(tenantId);

		await this._AssignAsync(token, tenantId, roleId, userAccountId);

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var junctionXmin = await dbContext.Database
			.SqlQuery<string>($"""
				SELECT xmin::text AS "Value" FROM user_account_roles
				WHERE user_account_id = {userAccountId} AND role_id = {roleId}
				""")
			.FirstAsync();
		var auditXmin = await dbContext.Database
			.SqlQuery<string>($"""
				SELECT xmin::text AS "Value" FROM audit_logs
				WHERE target_id = {roleId}
					AND action = {AuditActions.TenantRoleUserAssigned}
				""")
			.FirstAsync();

		junctionXmin.Should().NotBeNullOrEmpty();
		auditXmin.Should().Be(
			junctionXmin,
			"the assignment and its only audit record must be written by one transaction"
		);
	}

	/// <summary>
	/// Red-side proof for assign: if the audit row cannot be persisted, the membership must not
	/// exist either. A non-existent actor violates the audit_logs → users foreign key and fails
	/// the shared SaveChanges. Under handler-side auditing the junction insert would already
	/// have committed and only the audit would have failed.
	/// </summary>
	[Fact]
	public async Task ItShouldNotPersistAssignmentWhenItsAuditEntryCannotBeWritten() {
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);
		var userAccountId = await this._CreateTenantMemberAsync(tenantId);

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var service = scope.ServiceProvider
			.GetRequiredService<ITenantRoleAsStaffService>();

		var act = async () => await service.SetTenantRoleUserAsync(
			new SetTenantRoleUserArgs(
				TenantId: tenantId,
				RoleId: roleId,
				UserAccountId: userAccountId,
				IsAssigned: true,
				ActorUserId: Guid.NewGuid()
			)
		);

		_ = await act.Should().ThrowAsync<DbUpdateException>();

		(await this._CountAssignmentsAsync(userAccountId, roleId)).Should().Be(0);
		(await this._CountAuditLogsAsync(roleId)).Should().Be(0);
	}

	/// <summary>
	/// Red-side proof for unassign, the case that matters most: the junction row is hard-deleted,
	/// so a lost audit entry destroys the only evidence the membership existed. If the audit row
	/// cannot be written, the membership must survive.
	/// </summary>
	[Fact]
	public async Task ItShouldNotUnassignWhenItsAuditEntryCannotBeWritten() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);
		var userAccountId = await this._CreateTenantMemberAsync(tenantId);

		await this._AssignAsync(token, tenantId, roleId, userAccountId);

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var service = scope.ServiceProvider
			.GetRequiredService<ITenantRoleAsStaffService>();

		var act = async () => await service.SetTenantRoleUserAsync(
			new SetTenantRoleUserArgs(
				TenantId: tenantId,
				RoleId: roleId,
				UserAccountId: userAccountId,
				IsAssigned: false,
				ActorUserId: Guid.NewGuid()
			)
		);

		_ = await act.Should().ThrowAsync<DbUpdateException>();

		// The membership survives because its removal could not be recorded.
		(await this._CountAssignmentsAsync(userAccountId, roleId)).Should().Be(1);
		(await this._CountAuditLogsAsync(roleId, AuditActions.TenantRoleUserUnassigned))
			.Should().Be(0);
	}

	// ---------------------------------------------------------------------------------------
	// Quota
	// ---------------------------------------------------------------------------------------

	[Fact]
	public async Task ItShouldReturnValidationProblemWhenMaxRolesPerUserExceeded() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var userAccountId = await this._CreateTenantMemberAsync(tenantId);
		var maxRolesPerUser = AppEnvironment.Instance.MAX_ROLES_PER_USER;

		for (var i = 0; i < maxRolesPerUser; i++) {
			var filledRoleId = await this._CreateTenantRoleAsync(tenantId);
			await this._AssignAsync(token, tenantId, filledRoleId, userAccountId);
		}

		var overflowRoleId = await this._CreateTenantRoleAsync(tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantRoleUsersAsStaffSpec._GetToggleUrl(
				tenantId.ToString(),
				overflowRoleId.ToString(),
				userAccountId.ToString()
			)
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MaxRolesPerUserExceeded);
		problem.Errors.Should().ContainKey("user_account_id");

		(await this._CountAssignmentsAsync(userAccountId, overflowRoleId)).Should().Be(0);
		(await this._CountAuditLogsAsync(overflowRoleId)).Should().Be(0);
	}

	[Fact]
	public async Task ItShouldAllowRepeatedAssignOfExistingRoleWhenAtCap() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var userAccountId = await this._CreateTenantMemberAsync(tenantId);
		var maxRolesPerUser = AppEnvironment.Instance.MAX_ROLES_PER_USER;

		var assignedRoleIds = new List<Guid>();
		for (var i = 0; i < maxRolesPerUser; i++) {
			var filledRoleId = await this._CreateTenantRoleAsync(tenantId);
			await this._AssignAsync(token, tenantId, filledRoleId, userAccountId);
			assignedRoleIds.Add(filledRoleId);
		}

		// Re-asserting an assignment the member already holds must stay idempotent even though
		// the member sits exactly at the cap.
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantRoleUsersAsStaffSpec._GetToggleUrl(
				tenantId.ToString(),
				assignedRoleIds[0].ToString(),
				userAccountId.ToString()
			)
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NoContent);

		(await this._CountAssignmentsAsync(userAccountId, assignedRoleIds[0])).Should().Be(1);
	}

	/// <summary>
	/// A junction row pointing at a soft-deleted role grants nothing, so it must not consume
	/// quota. Fill the cap, soft-delete one of those roles while leaving its link, and the
	/// freed slot must become usable.
	/// </summary>
	[Fact]
	public async Task ItShouldExcludeLinksToSoftDeletedRolesFromTheQuota() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var userAccountId = await this._CreateTenantMemberAsync(tenantId);
		var maxRolesPerUser = AppEnvironment.Instance.MAX_ROLES_PER_USER;

		var assignedRoleIds = new List<Guid>();
		for (var i = 0; i < maxRolesPerUser; i++) {
			var filledRoleId = await this._CreateTenantRoleAsync(tenantId);
			await this._AssignAsync(token, tenantId, filledRoleId, userAccountId);
			assignedRoleIds.Add(filledRoleId);
		}

		// Soft-delete the role while deliberately leaving the junction row behind: exactly
		// the state the quota count must ignore.
		await this._SoftDeleteRoleLeavingLinksAsync(assignedRoleIds[0]);

		var newRoleId = await this._CreateTenantRoleAsync(tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantRoleUsersAsStaffSpec._GetToggleUrl(tenantId.ToString(), newRoleId.ToString(), userAccountId.ToString())
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(
			HttpStatusCode.NoContent,
			"the dead role's link must not occupy a quota slot"
		);

		(await this._CountAssignmentsAsync(userAccountId, newRoleId)).Should().Be(1);
	}

	// ---------------------------------------------------------------------------------------
	// Concurrency — barrier-controlled. Each spec holds the contended row lock itself, waits
	// until every contender is provably parked on that lock, and only then releases it.
	// ---------------------------------------------------------------------------------------

	/// <summary>
	/// Cap race. A controlling transaction holds the member's <c>user_accounts</c> row lock —
	/// the very lock the service takes at lock-order step 2, before its quota count. Four
	/// assigns are fired at a member with one free slot and must all park on that lock; only
	/// then is it released, so every contender is provably inside the count-before-insert
	/// window simultaneously. Exactly one may win.
	/// <para>
	/// The barrier is its own red control: with the service's row lock removed the contenders
	/// never touch the account row, never park, and
	/// <see cref="PostgresLockBarrier.WaitUntilBlockedAsync"/> times out — the spec fails
	/// passing on a lucky schedule.
	/// </para>
	/// </summary>
	[Fact]
	public async Task ItShouldNotExceedCapForConcurrentAssignsAtTheLastFreeSlot() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var userAccountId = await this._CreateTenantMemberAsync(tenantId);
		var maxRolesPerUser = AppEnvironment.Instance.MAX_ROLES_PER_USER;

		for (var i = 0; i < maxRolesPerUser - 1; i++) {
			var filledRoleId = await this._CreateTenantRoleAsync(tenantId);
			await this._AssignAsync(token, tenantId, filledRoleId, userAccountId);
		}

		const int ContenderCount = 4;
		var contendedRoleIds = new List<Guid>();
		for (var i = 0; i < ContenderCount; i++) {
			contendedRoleIds.Add(await this._CreateTenantRoleAsync(tenantId));
		}

		await using var barrierScope = this._Fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();
		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM user_accounts WHERE id = {userAccountId} FOR UPDATE"
		);
		var barrierPid = await PostgresLockBarrier.GetBackendPidAsync(barrierDb);

		var responseTask = Task.WhenAll(
			contendedRoleIds.Select(async contendedRoleId => {
				using var request = new HttpRequestMessage(
					HttpMethod.Post,
					TenantRoleUsersAsStaffSpec._GetToggleUrl(
						tenantId.ToString(),
						contendedRoleId.ToString(),
						userAccountId.ToString()
					)
				).WithSessionToken(token);

				using var response = await this._Http.SendAsync(request);
				return response.StatusCode;
			})
		);

		await PostgresLockBarrier.WaitUntilBlockedAsync(
			this._Fixture.Factory.Services,
			ContenderCount,
			barrierPid
		);

		await barrierTx.CommitAsync();
		var responses = await responseTask;

		responses.Count(status => status == HttpStatusCode.NoContent).Should().Be(1);
		responses.Count(status => status == HttpStatusCode.UnprocessableEntity)
			.Should().Be(ContenderCount - 1);

		(await this._CountLiveRolesForMemberAsync(userAccountId))
			.Should().Be(maxRolesPerUser);
	}

	/// <summary>
	/// Assign versus role delete. The assign parks on the role row lock while the role
	/// is soft-deleted and its links purged. Because the lock statement carries the liveness
	/// predicate, the assign re-evaluates it once the delete commits, finds no row, and reports
	/// 404 instead of inserting a link under a role the delete already cleaned up.
	/// </summary>
	[Fact]
	public async Task ItShouldNotLeaveStaleLinkWhenRoleIsDeletedDuringAssign() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);
		var userAccountId = await this._CreateTenantMemberAsync(tenantId);

		await using var barrierScope = this._Fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();
		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM roles WHERE id = {roleId} FOR UPDATE"
		);
		var barrierPid = await PostgresLockBarrier.GetBackendPidAsync(barrierDb);

		var responseTask = Task.Run(async () => {
			using var request = new HttpRequestMessage(
				HttpMethod.Post,
				TenantRoleUsersAsStaffSpec._GetToggleUrl(tenantId.ToString(), roleId.ToString(), userAccountId.ToString())
			).WithSessionToken(token);

			using var response = await this._Http.SendAsync(request);
			return response.StatusCode;
		});

		await PostgresLockBarrier.WaitUntilBlockedAsync(this._Fixture.Factory.Services, 1, barrierPid);

		// Complete the delete the assign is racing, exactly as the delete path does it.
		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"""
			UPDATE roles
			SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW()
			WHERE id = {roleId}
			"""
		);
		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"DELETE FROM user_account_roles WHERE role_id = {roleId}"
		);
		await barrierTx.CommitAsync();

		(await responseTask).Should().Be(HttpStatusCode.NotFound);
		(await this._CountAssignmentsAsync(userAccountId, roleId)).Should().Be(
			0,
			"a deleted role must not gain a member behind the delete's cleanup"
		);
	}

	/// <summary>
	/// Assign versus member removal. The assign parks on the account row lock while the
	/// membership is soft-deleted and its links purged. Matching on id alone would still find
	/// the physical row; carrying <c>is_deleted = FALSE</c> into the lock statement is what
	/// turns this into a 404.
	/// </summary>
	[Fact]
	public async Task ItShouldNotLeaveStaleLinkWhenMemberIsRemovedDuringAssign() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);
		var userAccountId = await this._CreateTenantMemberAsync(tenantId);

		await using var barrierScope = this._Fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();
		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM user_accounts WHERE id = {userAccountId} FOR UPDATE"
		);
		var barrierPid = await PostgresLockBarrier.GetBackendPidAsync(barrierDb);

		var responseTask = Task.Run(async () => {
			using var request = new HttpRequestMessage(
				HttpMethod.Post,
				TenantRoleUsersAsStaffSpec._GetToggleUrl(tenantId.ToString(), roleId.ToString(), userAccountId.ToString())
			).WithSessionToken(token);

			using var response = await this._Http.SendAsync(request);
			return response.StatusCode;
		});

		await PostgresLockBarrier.WaitUntilBlockedAsync(this._Fixture.Factory.Services, 1, barrierPid);

		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"""
			UPDATE user_accounts
			SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW()
			WHERE id = {userAccountId}
			"""
		);
		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"DELETE FROM user_account_roles WHERE user_account_id = {userAccountId}"
		);
		await barrierTx.CommitAsync();

		(await responseTask).Should().Be(HttpStatusCode.NotFound);
		(await this._CountAssignmentsAsync(userAccountId, roleId)).Should().Be(
			0,
			"a removed membership must not be resurrected by a racing assign"
		);
	}

	// ---------------------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------------------

	private async Task<(Guid RoleId, Guid UserAccountId)> _BuildGuardCaseAsync(
		Guid tenantId,
		TenantRoleUserGuardCase guardCase
	) {
		if (guardCase == TenantRoleUserGuardCase.ForeignTenantRole) {
			var otherTenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.TechStartName);
			return (
				await this._CreateTenantRoleAsync(otherTenantId),
				await this._CreateTenantMemberAsync(tenantId)
			);
		}

		if (guardCase == TenantRoleUserGuardCase.ForeignTenantMember) {
			var otherTenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.TechStartName);
			return (
				await this._CreateTenantRoleAsync(tenantId),
				await this._CreateTenantMemberAsync(otherTenantId)
			);
		}

		if (guardCase == TenantRoleUserGuardCase.StaffScopeRole) {
			return (
				await this._CreateStaffRoleAsync(),
				await this._CreateTenantMemberAsync(tenantId)
			);
		}

		if (guardCase == TenantRoleUserGuardCase.StaffScopeAccount) {
			return (
				await this._CreateTenantRoleAsync(tenantId),
				await this._CreateStaffAccountAsync()
			);
		}

		if (guardCase == TenantRoleUserGuardCase.DeletedRole) {
			// Assign first, then soft-delete the role while leaving the link, so the spec
			// also proves the guard does not silently mutate the surviving row.
			var token = await this._AuthClient.LoginAsStaffAdminAsync();
			var roleId = await this._CreateTenantRoleAsync(tenantId);
			var userAccountId = await this._CreateTenantMemberAsync(tenantId);
			await this._AssignAsync(token, tenantId, roleId, userAccountId);
			await this._SoftDeleteRoleLeavingLinksAsync(roleId);
			return (roleId, userAccountId);
		}

		if (guardCase == TenantRoleUserGuardCase.DeletedMember) {
			var roleId = await this._CreateTenantRoleAsync(tenantId);
			var userAccountId = await this._CreateTenantMemberAsync(tenantId, isDeleted: true);
			return (roleId, userAccountId);
		}

		throw new ArgumentOutOfRangeException(nameof(guardCase), guardCase, "Unhandled case");
	}

	private async Task<string> _CreateStaffTokenWithPermissionsAsync(
		string emailPrefix,
		params string[] permissionKeys
	) {
		var email = $"{emailPrefix}-{Guid.NewGuid():N}@example.com";
		var userId = await StaffUserTestHelper.SeedStaffUserAsync(this._Fixture, email);

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var staffAccount = await (
			from account in dbContext.UserAccount
			where account.UserId == userId
				&& account.Scope == AccountScope.Staff
				&& !account.IsDeleted
			select account
		).FirstAsync();

		var role = Role.CreateStaffRole(
			$"{emailPrefix}-permission-{Guid.NewGuid():N}",
			"Test-only staff role for tenant role member assignment permissions"
		);

		_ = dbContext.Role.Add(role);
		_ = await dbContext.SaveChangesAsync();

		foreach (var permissionKey in permissionKeys) {
			_ = dbContext.RolePermission.Add(new RolePermission {
				RoleId = role.GetRequiredId(),
				PermissionKey = permissionKey,
			});
		}

		_ = dbContext.UserAccountRole.Add(new UserAccountRole {
			UserAccountId = staffAccount.GetRequiredId(),
			RoleId = role.GetRequiredId(),
		});
		_ = await dbContext.SaveChangesAsync();

		return await this._AuthClient.LoginAsync(email, TestConstants.SeedPassword);
	}

	private async Task _AssignAsync(
		string staffToken,
		Guid tenantId,
		Guid roleId,
		Guid userAccountId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantRoleUsersAsStaffSpec._GetToggleUrl(tenantId.ToString(), roleId.ToString(), userAccountId.ToString())
		).WithSessionToken(staffToken);

		using var response = await this._Http.SendAsync(request);
		response.EnsureSuccessStatusCode();
	}

	private async Task<Guid> _GetTenantIdAsync(string tenantName) {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(this._Http, token, tenantName);
	}

	private async Task<Guid> _CreateTenantRoleAsync(Guid tenantId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var role = Role.CreateTenantRole(
			tenantId,
			name: "Tenant Role " + Guid.NewGuid().ToString("N")[..8],
			description: "Role created for member assignment tests"
		);
		role.ValidateRoleType();

		_ = dbContext.Role.Add(role);
		_ = await dbContext.SaveChangesAsync();

		return role.GetRequiredId();
	}

	private async Task<Guid> _CreateStaffRoleAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var role = Role.CreateStaffRole(
			name: "Staff Role " + Guid.NewGuid().ToString("N")[..8],
			description: "Staff role created for member assignment tests"
		);
		role.ValidateRoleType();

		_ = dbContext.Role.Add(role);
		_ = await dbContext.SaveChangesAsync();

		return role.GetRequiredId();
	}

	private async Task _SoftDeleteRoleLeavingLinksAsync(Guid roleId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		// Raw SQL on purpose: the delete service would also purge the junction rows, and these
		// specs need the "dead role, surviving link" state that quota and guard logic must
		// tolerate.
		_ = await dbContext.Database.ExecuteSqlAsync(
			$"""
			UPDATE roles
			SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW()
			WHERE id = {roleId}
			"""
		);
	}

	private async Task<Guid> _CreateStaffAccountAsync() {
		var email = $"staff-account-{Guid.NewGuid():N}@example.com";
		var userId = await StaffUserTestHelper.SeedStaffUserAsync(this._Fixture, email);

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var staffAccount = await (
			from account in dbContext.UserAccount
			where account.UserId == userId
				&& account.Scope == AccountScope.Staff
				&& !account.IsDeleted
			select account
		).FirstAsync();

		return staffAccount.GetRequiredId();
	}

	/// <summary>
	/// Creates a dedicated tenant member so cap and concurrency specs never contend with seeded
	/// accounts other specs also assign roles to.
	/// </summary>
	private async Task<Guid> _CreateTenantMemberAsync(
		Guid tenantId,
		AccountStatus status = AccountStatus.Active,
		bool isDeleted = false
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var suffix = Guid.NewGuid().ToString("N")[..8];
		var user = new User {
			Email = $"member-{suffix}@example.com",
			Password = "hash",
			FirstName = "Cap",
			LastName = "Member",
			Status = UserStatus.Active,
			IsVerified = true
		};

		_ = dbContext.User.Add(user);
		_ = await dbContext.SaveChangesAsync();

		var account = UserAccount.CreateTenantAccount(user.GetRequiredId(), tenantId);
		account.ValidateAccountType();
		account.Status = status;

		_ = dbContext.UserAccount.Add(account);
		_ = await dbContext.SaveChangesAsync();

		if (isDeleted) {
			account.IsDeleted = true;
			account.DeletedAt = DateTime.UtcNow;
			_ = await dbContext.SaveChangesAsync();
		}

		return account.GetRequiredId();
	}

	private async Task<int> _CountAssignmentsAsync(Guid userAccountId, Guid roleId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.UserAccountRole
			.Where(uap => uap.UserAccountId == userAccountId && uap.RoleId == roleId)
			.CountAsync();
	}

	private async Task<int> _CountLiveRolesForMemberAsync(Guid userAccountId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await (
			from uap in dbContext.UserAccountRole
			from p in dbContext.Role
			where p.Id == uap.RoleId
				&& uap.UserAccountId == userAccountId
				&& !p.IsDeleted
			select uap.RoleId
		).CountAsync();
	}

	private async Task<int> _CountAuditLogsAsync(Guid targetId, string? action = null) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.AuditLog
			.Where(log =>
				log.TargetId == targetId
				&& (action == null || log.Action == action)
			)
			.CountAsync();
	}

	private async Task<AuditLog?> _GetLatestAuditLogAsync(string action, Guid targetId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.AuditLog
			.Where(log => log.Action == action && log.TargetId == targetId)
			.OrderByDescending(log => log.CreatedAt)
			.FirstOrDefaultAsync();
	}

	private static void _AssertAuditDetails(
		AuditLog auditLog,
		Guid expectedTenantId,
		Guid expectedRoleId,
		Guid expectedUserAccountId
	) {
		auditLog.Details.Should().NotBeNull();
		Assert.NotNull(auditLog.Details);
		using var document = JsonDocument.Parse(auditLog.Details);
		var details = document.RootElement;

		details.GetProperty("TenantId").GetGuid().Should().Be(expectedTenantId);
		details.GetProperty("RoleId").GetGuid().Should().Be(expectedRoleId);
		details.GetProperty("UserAccountId").GetGuid().Should().Be(expectedUserAccountId);
	}
}
