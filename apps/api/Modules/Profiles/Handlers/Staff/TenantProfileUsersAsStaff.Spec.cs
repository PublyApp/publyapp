
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
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Profiles.Services;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

/// <summary>
/// Targets for the guard matrix. Each resolves to a profile/member pair that both verbs must
/// reject identically.
/// </summary>
public enum TenantProfileUserGuardCase {
	ForeignTenantProfile,
	ForeignTenantMember,
	StaffScopeProfile,
	StaffScopeAccount,
	DeletedProfile,
	DeletedMember,
}

public sealed class TenantProfileUsersAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public TenantProfileUsersAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetToggleUrl(
		string tenantId,
		string profileId,
		string userAccountId
	) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Profiles.ForTenantAsStaff.Users.UpsertFn(profileId, userAccountId)
		);
	}

	// ---------------------------------------------------------------------------------------
	// Authorization matrix
	// ---------------------------------------------------------------------------------------

	[Theory]
	[InlineData("POST")]
	[InlineData("DELETE")]
	public async Task ItShouldReturnUnauthorizedWithoutSession(string verb) {
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);

		using var request = new HttpRequestMessage(
			new HttpMethod(verb),
			GetToggleUrl(
				tenantId.ToString(),
				Guid.NewGuid().ToString(),
				Guid.NewGuid().ToString()
			)
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Theory]
	[InlineData("POST")]
	[InlineData("DELETE")]
	public async Task ItShouldReturnForbiddenForStaffWithNeitherPermission(string verb) {
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var token = await _authClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			new HttpMethod(verb),
			GetToggleUrl(
				tenantId.ToString(),
				Guid.NewGuid().ToString(),
				Guid.NewGuid().ToString()
			)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
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
		bool holdsProfilesPermission
	) {
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);
		var userAccountId = await CreateTenantMemberAsync(tenantId);

		var heldPermission = holdsProfilesPermission
			? AppPermissions.Staff.Profiles.UPDATE_FOR_TENANT.Key
			: AppPermissions.Staff.Users.UPDATE_FOR_TENANT.Key;

		var token = await CreateStaffTokenWithPermissionsAsync("one-perm", heldPermission);

		using var request = new HttpRequestMessage(
			new HttpMethod(verb),
			GetToggleUrl(tenantId.ToString(), profileId.ToString(), userAccountId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

		// The rejection must be authorization, not a silent no-op.
		(await CountAssignmentsAsync(userAccountId, profileId)).Should().Be(0);
	}

	/// <summary>
	/// Counterpart to the one-permission specs: holding both must actually work, proving the AND
	/// is exactly right rather than merely restrictive.
	/// </summary>
	[Fact]
	public async Task ItShouldAllowAssignForStaffWithBothRequiredPermissions() {
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);
		var userAccountId = await CreateTenantMemberAsync(tenantId);

		var token = await CreateStaffTokenWithPermissionsAsync(
			"both-perms",
			AppPermissions.Staff.Profiles.UPDATE_FOR_TENANT.Key,
			AppPermissions.Staff.Users.UPDATE_FOR_TENANT.Key
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(tenantId.ToString(), profileId.ToString(), userAccountId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NoContent);

		(await CountAssignmentsAsync(userAccountId, profileId)).Should().Be(1);
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
		string? malformedProfileId,
		string? malformedUserAccountId
	) {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);

		using var request = new HttpRequestMessage(
			new HttpMethod(verb),
			GetToggleUrl(
				malformedTenantId ?? tenantId.ToString(),
				malformedProfileId ?? Guid.NewGuid().ToString(),
				malformedUserAccountId ?? Guid.NewGuid().ToString()
			)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	// ---------------------------------------------------------------------------------------
	// Guard matrix — cross-scope / cross-tenant / dead-entity cases, both verbs
	// ---------------------------------------------------------------------------------------

	[Theory]
	[InlineData("POST", TenantProfileUserGuardCase.ForeignTenantProfile)]
	[InlineData("POST", TenantProfileUserGuardCase.ForeignTenantMember)]
	[InlineData("POST", TenantProfileUserGuardCase.StaffScopeProfile)]
	[InlineData("POST", TenantProfileUserGuardCase.StaffScopeAccount)]
	[InlineData("POST", TenantProfileUserGuardCase.DeletedProfile)]
	[InlineData("POST", TenantProfileUserGuardCase.DeletedMember)]
	[InlineData("DELETE", TenantProfileUserGuardCase.ForeignTenantProfile)]
	[InlineData("DELETE", TenantProfileUserGuardCase.ForeignTenantMember)]
	[InlineData("DELETE", TenantProfileUserGuardCase.StaffScopeProfile)]
	[InlineData("DELETE", TenantProfileUserGuardCase.StaffScopeAccount)]
	[InlineData("DELETE", TenantProfileUserGuardCase.DeletedProfile)]
	[InlineData("DELETE", TenantProfileUserGuardCase.DeletedMember)]
	public async Task ItShouldReturnNotFoundForGuardedTargets(
		string verb,
		TenantProfileUserGuardCase guardCase
	) {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var (profileId, userAccountId) = await BuildGuardCaseAsync(tenantId, guardCase);

		var auditCountBefore = await CountAuditLogsAsync(profileId);
		var assignmentCountBefore = await CountAssignmentsAsync(userAccountId, profileId);

		using var request = new HttpRequestMessage(
			new HttpMethod(verb),
			GetToggleUrl(tenantId.ToString(), profileId.ToString(), userAccountId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);

		// A rejected guard must neither create nor destroy membership, nor fabricate history.
		(await CountAssignmentsAsync(userAccountId, profileId))
			.Should().Be(assignmentCountBefore);
		(await CountAuditLogsAsync(profileId)).Should().Be(auditCountBefore);
	}

	/// <summary>
	/// Suspension is not removal: staff must still manage a suspended member's profiles. The
	/// positive counterpart to the DeletedMember guard case.
	/// </summary>
	[Fact]
	public async Task ItShouldAssignForSuspendedMember() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);
		var userAccountId = await CreateTenantMemberAsync(
			tenantId,
			status: AccountStatus.Suspended
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(tenantId.ToString(), profileId.ToString(), userAccountId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NoContent);

		(await CountAssignmentsAsync(userAccountId, profileId)).Should().Be(1);
	}

	// ---------------------------------------------------------------------------------------
	// Happy paths, idempotency, audit
	// ---------------------------------------------------------------------------------------

	[Fact]
	public async Task ItShouldAssignMemberToTenantProfileWithAuditEntry() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);
		var userAccountId = await CreateTenantMemberAsync(tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(tenantId.ToString(), profileId.ToString(), userAccountId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NoContent);

		(await CountAssignmentsAsync(userAccountId, profileId)).Should().Be(1);

		var auditLog = await GetLatestAuditLogAsync(
			AuditActions.TenantProfileUserAssigned,
			profileId
		);
		Assert.NotNull(auditLog);
		AssertAuditDetails(auditLog, tenantId, profileId, userAccountId);
	}

	[Fact]
	public async Task ItShouldTreatRepeatedAssignAsIdempotentSuccessWithoutSecondAuditEntry() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);
		var userAccountId = await CreateTenantMemberAsync(tenantId);

		await AssignAsync(token, tenantId, profileId, userAccountId);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(tenantId.ToString(), profileId.ToString(), userAccountId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NoContent);

		// One membership row, and exactly one audit entry: a no-op must not append history.
		(await CountAssignmentsAsync(userAccountId, profileId)).Should().Be(1);
		(await CountAuditLogsAsync(profileId, AuditActions.TenantProfileUserAssigned))
			.Should().Be(1);
	}

	[Fact]
	public async Task ItShouldUnassignMemberFromTenantProfileWithAuditEntry() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);
		var userAccountId = await CreateTenantMemberAsync(tenantId);

		await AssignAsync(token, tenantId, profileId, userAccountId);

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetToggleUrl(tenantId.ToString(), profileId.ToString(), userAccountId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NoContent);

		// Unassignment hard-deletes the junction row; the audit entry is the only history.
		(await CountAssignmentsAsync(userAccountId, profileId)).Should().Be(0);

		var auditLog = await GetLatestAuditLogAsync(
			AuditActions.TenantProfileUserUnassigned,
			profileId
		);
		Assert.NotNull(auditLog);
		AssertAuditDetails(auditLog, tenantId, profileId, userAccountId);
	}

	[Fact]
	public async Task ItShouldTreatUnassignOfUnassignedProfileAsNoOp() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);
		var userAccountId = await CreateTenantMemberAsync(tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetToggleUrl(tenantId.ToString(), profileId.ToString(), userAccountId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NoContent);

		(await CountAssignmentsAsync(userAccountId, profileId)).Should().Be(0);
		(await CountAuditLogsAsync(profileId, AuditActions.TenantProfileUserUnassigned))
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
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);
		var userAccountId = await CreateTenantMemberAsync(tenantId);

		await AssignAsync(token, tenantId, profileId, userAccountId);

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var junctionXmin = await dbContext.Database
			.SqlQuery<string>($"""
				SELECT xmin::text AS "Value" FROM user_account_profiles
				WHERE user_account_id = {userAccountId} AND profile_id = {profileId}
				""")
			.FirstAsync();
		var auditXmin = await dbContext.Database
			.SqlQuery<string>($"""
				SELECT xmin::text AS "Value" FROM audit_logs
				WHERE target_id = {profileId}
					AND action = {AuditActions.TenantProfileUserAssigned}
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
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);
		var userAccountId = await CreateTenantMemberAsync(tenantId);

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var service = scope.ServiceProvider
			.GetRequiredService<ITenantProfileAsStaffService>();

		var act = async () => await service.SetTenantProfileUserAsync(
			new SetTenantProfileUserArgs(
				TenantId: tenantId,
				ProfileId: profileId,
				UserAccountId: userAccountId,
				IsAssigned: true,
				ActorUserId: Guid.NewGuid()
			)
		);

		_ = await act.Should().ThrowAsync<DbUpdateException>();

		(await CountAssignmentsAsync(userAccountId, profileId)).Should().Be(0);
		(await CountAuditLogsAsync(profileId)).Should().Be(0);
	}

	/// <summary>
	/// Red-side proof for unassign, the case that matters most: the junction row is hard-deleted,
	/// so a lost audit entry destroys the only evidence the membership existed. If the audit row
	/// cannot be written, the membership must survive.
	/// </summary>
	[Fact]
	public async Task ItShouldNotUnassignWhenItsAuditEntryCannotBeWritten() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);
		var userAccountId = await CreateTenantMemberAsync(tenantId);

		await AssignAsync(token, tenantId, profileId, userAccountId);

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var service = scope.ServiceProvider
			.GetRequiredService<ITenantProfileAsStaffService>();

		var act = async () => await service.SetTenantProfileUserAsync(
			new SetTenantProfileUserArgs(
				TenantId: tenantId,
				ProfileId: profileId,
				UserAccountId: userAccountId,
				IsAssigned: false,
				ActorUserId: Guid.NewGuid()
			)
		);

		_ = await act.Should().ThrowAsync<DbUpdateException>();

		// The membership survives because its removal could not be recorded.
		(await CountAssignmentsAsync(userAccountId, profileId)).Should().Be(1);
		(await CountAuditLogsAsync(profileId, AuditActions.TenantProfileUserUnassigned))
			.Should().Be(0);
	}

	// ---------------------------------------------------------------------------------------
	// Quota
	// ---------------------------------------------------------------------------------------

	[Fact]
	public async Task ItShouldReturnValidationProblemWhenMaxProfilesPerUserExceeded() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var userAccountId = await CreateTenantMemberAsync(tenantId);
		var maxProfilesPerUser = AppEnvironment.Instance.MAX_PROFILES_PER_USER;

		for (var i = 0; i < maxProfilesPerUser; i++) {
			var filledProfileId = await CreateTenantProfileAsync(tenantId);
			await AssignAsync(token, tenantId, filledProfileId, userAccountId);
		}

		var overflowProfileId = await CreateTenantProfileAsync(tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(
				tenantId.ToString(),
				overflowProfileId.ToString(),
				userAccountId.ToString()
			)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MaxProfilesPerUserExceeded);
		problem.Errors.Should().ContainKey("user_account_id");

		(await CountAssignmentsAsync(userAccountId, overflowProfileId)).Should().Be(0);
		(await CountAuditLogsAsync(overflowProfileId)).Should().Be(0);
	}

	[Fact]
	public async Task ItShouldAllowRepeatedAssignOfExistingProfileWhenAtCap() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var userAccountId = await CreateTenantMemberAsync(tenantId);
		var maxProfilesPerUser = AppEnvironment.Instance.MAX_PROFILES_PER_USER;

		var assignedProfileIds = new List<Guid>();
		for (var i = 0; i < maxProfilesPerUser; i++) {
			var filledProfileId = await CreateTenantProfileAsync(tenantId);
			await AssignAsync(token, tenantId, filledProfileId, userAccountId);
			assignedProfileIds.Add(filledProfileId);
		}

		// Re-asserting an assignment the member already holds must stay idempotent even though
		// the member sits exactly at the cap.
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(
				tenantId.ToString(),
				assignedProfileIds[0].ToString(),
				userAccountId.ToString()
			)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NoContent);

		(await CountAssignmentsAsync(userAccountId, assignedProfileIds[0])).Should().Be(1);
	}

	/// <summary>
	/// A junction row pointing at a soft-deleted profile grants nothing, so it must not consume
	/// quota. Fill the cap, soft-delete one of those profiles while leaving its link, and the
	/// freed slot must become usable.
	/// </summary>
	[Fact]
	public async Task ItShouldExcludeLinksToSoftDeletedProfilesFromTheQuota() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var userAccountId = await CreateTenantMemberAsync(tenantId);
		var maxProfilesPerUser = AppEnvironment.Instance.MAX_PROFILES_PER_USER;

		var assignedProfileIds = new List<Guid>();
		for (var i = 0; i < maxProfilesPerUser; i++) {
			var filledProfileId = await CreateTenantProfileAsync(tenantId);
			await AssignAsync(token, tenantId, filledProfileId, userAccountId);
			assignedProfileIds.Add(filledProfileId);
		}

		// Soft-delete the profile while deliberately leaving the junction row behind: exactly
		// the state the quota count must ignore.
		await SoftDeleteProfileLeavingLinksAsync(assignedProfileIds[0]);

		var newProfileId = await CreateTenantProfileAsync(tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(tenantId.ToString(), newProfileId.ToString(), userAccountId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(
			HttpStatusCode.NoContent,
			"the dead profile's link must not occupy a quota slot"
		);

		(await CountAssignmentsAsync(userAccountId, newProfileId)).Should().Be(1);
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
	/// <see cref="WaitUntilBlockedOnLocksAsync"/> times out — the spec fails rather than
	/// passing on a lucky schedule.
	/// </para>
	/// </summary>
	[Fact]
	public async Task ItShouldNotExceedCapForConcurrentAssignsAtTheLastFreeSlot() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var userAccountId = await CreateTenantMemberAsync(tenantId);
		var maxProfilesPerUser = AppEnvironment.Instance.MAX_PROFILES_PER_USER;

		for (var i = 0; i < maxProfilesPerUser - 1; i++) {
			var filledProfileId = await CreateTenantProfileAsync(tenantId);
			await AssignAsync(token, tenantId, filledProfileId, userAccountId);
		}

		const int ContenderCount = 4;
		var contendedProfileIds = new List<Guid>();
		for (var i = 0; i < ContenderCount; i++) {
			contendedProfileIds.Add(await CreateTenantProfileAsync(tenantId));
		}

		await using var barrierScope = _fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();
		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM user_accounts WHERE id = {userAccountId} FOR UPDATE"
		);
		var barrierPid = await GetBackendPidAsync(barrierDb);

		var responseTask = Task.WhenAll(
			contendedProfileIds.Select(async contendedProfileId => {
				using var request = new HttpRequestMessage(
					HttpMethod.Post,
					GetToggleUrl(
						tenantId.ToString(),
						contendedProfileId.ToString(),
						userAccountId.ToString()
					)
				).WithSessionToken(token);

				using var response = await _http.SendAsync(request);
				return response.StatusCode;
			})
		);

		await WaitUntilBlockedOnLocksAsync(ContenderCount, barrierPid);

		await barrierTx.CommitAsync();
		var responses = await responseTask;

		responses.Count(status => status == HttpStatusCode.NoContent).Should().Be(1);
		responses.Count(status => status == HttpStatusCode.UnprocessableEntity)
			.Should().Be(ContenderCount - 1);

		(await CountLiveProfilesForMemberAsync(userAccountId))
			.Should().Be(maxProfilesPerUser);
	}

	/// <summary>
	/// Assign versus profile delete. The assign parks on the profile row lock while the profile
	/// is soft-deleted and its links purged. Because the lock statement carries the liveness
	/// predicate, the assign re-evaluates it once the delete commits, finds no row, and reports
	/// 404 instead of inserting a link under a profile the delete already cleaned up.
	/// </summary>
	[Fact]
	public async Task ItShouldNotLeaveStaleLinkWhenProfileIsDeletedDuringAssign() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);
		var userAccountId = await CreateTenantMemberAsync(tenantId);

		await using var barrierScope = _fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();
		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM profiles WHERE id = {profileId} FOR UPDATE"
		);
		var barrierPid = await GetBackendPidAsync(barrierDb);

		var responseTask = Task.Run(async () => {
			using var request = new HttpRequestMessage(
				HttpMethod.Post,
				GetToggleUrl(tenantId.ToString(), profileId.ToString(), userAccountId.ToString())
			).WithSessionToken(token);

			using var response = await _http.SendAsync(request);
			return response.StatusCode;
		});

		await WaitUntilBlockedOnLocksAsync(1, barrierPid);

		// Complete the delete the assign is racing, exactly as the delete path does it.
		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"""
			UPDATE profiles
			SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW()
			WHERE id = {profileId}
			"""
		);
		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"DELETE FROM user_account_profiles WHERE profile_id = {profileId}"
		);
		await barrierTx.CommitAsync();

		(await responseTask).Should().Be(HttpStatusCode.NotFound);
		(await CountAssignmentsAsync(userAccountId, profileId)).Should().Be(
			0,
			"a deleted profile must not gain a member behind the delete's cleanup"
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
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);
		var userAccountId = await CreateTenantMemberAsync(tenantId);

		await using var barrierScope = _fixture.Factory.Services.CreateAsyncScope();
		var barrierDb = barrierScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var barrierTx = await barrierDb.Database.BeginTransactionAsync();
		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"SELECT 1 FROM user_accounts WHERE id = {userAccountId} FOR UPDATE"
		);
		var barrierPid = await GetBackendPidAsync(barrierDb);

		var responseTask = Task.Run(async () => {
			using var request = new HttpRequestMessage(
				HttpMethod.Post,
				GetToggleUrl(tenantId.ToString(), profileId.ToString(), userAccountId.ToString())
			).WithSessionToken(token);

			using var response = await _http.SendAsync(request);
			return response.StatusCode;
		});

		await WaitUntilBlockedOnLocksAsync(1, barrierPid);

		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"""
			UPDATE user_accounts
			SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW()
			WHERE id = {userAccountId}
			"""
		);
		_ = await barrierDb.Database.ExecuteSqlAsync(
			$"DELETE FROM user_account_profiles WHERE user_account_id = {userAccountId}"
		);
		await barrierTx.CommitAsync();

		(await responseTask).Should().Be(HttpStatusCode.NotFound);
		(await CountAssignmentsAsync(userAccountId, profileId)).Should().Be(
			0,
			"a removed membership must not be resurrected by a racing assign"
		);
	}

	// ---------------------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------------------

	/// <summary>
	/// Blocks until <paramref name="expectedCount"/> backends are parked waiting specifically on
	/// the barrier transaction identified by <paramref name="barrierPid"/>. This is the barrier:
	/// it turns "we started some tasks" into "every contender has provably reached the contended
	/// lock and none has passed it".
	/// <para>
	/// Scoped through <c>pg_blocking_pids</c> rather than a global count of lock waiters: test
	/// classes run in parallel against the same database, so an unrelated spec's lock wait must
	/// never be mistaken for one of our contenders and release the barrier early.
	/// </para>
	/// </summary>
	private async Task WaitUntilBlockedOnLocksAsync(int expectedCount, int barrierPid) {
		var deadline = DateTime.UtcNow.AddSeconds(30);

		while (DateTime.UtcNow < deadline) {
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

			// Recursive because PostgreSQL serialises row-lock waiters through tuple locks:
			// only the first contender waits directly on the barrier, and the rest queue behind
			// that contender. Counting just the direct waiters would never reach the expected
			// number. Walking the wait tree rooted at the barrier counts the whole queue while
			// still ignoring lock waits from test classes running in parallel.
			var blocked = await dbContext.Database
				.SqlQuery<int>($"""
					WITH RECURSIVE waiters AS (
						SELECT pid FROM pg_stat_activity
						WHERE datname = current_database()
							AND {barrierPid} = ANY(pg_blocking_pids(pid))
						UNION
						SELECT sa.pid FROM pg_stat_activity sa, waiters w
						WHERE sa.datname = current_database()
							AND w.pid = ANY(pg_blocking_pids(sa.pid))
					)
					SELECT count(*)::int AS "Value" FROM waiters
					""")
				.FirstAsync();

			if (blocked >= expectedCount) {
				return;
			}

			await Task.Delay(50);
		}

		throw new InvalidOperationException(
			$"Timed out waiting for {expectedCount} request(s) to park on the row lock held by "
			+ "the barrier transaction. Either the lock is no longer taken before the guarded "
			+ "read, or the lock order changed — both defeat the protection this spec exists "
			+ "to prove."
		);
	}

	/// <summary>
	/// Backend pid of the connection behind <paramref name="dbContext"/>, used to scope the
	/// barrier wait to exactly the contenders this spec blocked.
	/// </summary>
	private static async Task<int> GetBackendPidAsync(AppDbContext dbContext) {
		return await dbContext.Database
			.SqlQuery<int>($"""SELECT pg_backend_pid()::int AS "Value" """)
			.FirstAsync();
	}

	private async Task<(Guid ProfileId, Guid UserAccountId)> BuildGuardCaseAsync(
		Guid tenantId,
		TenantProfileUserGuardCase guardCase
	) {
		if (guardCase == TenantProfileUserGuardCase.ForeignTenantProfile) {
			var otherTenantId = await GetTenantIdAsync(SeedConstants.Tenants.TechStartName);
			return (
				await CreateTenantProfileAsync(otherTenantId),
				await CreateTenantMemberAsync(tenantId)
			);
		}

		if (guardCase == TenantProfileUserGuardCase.ForeignTenantMember) {
			var otherTenantId = await GetTenantIdAsync(SeedConstants.Tenants.TechStartName);
			return (
				await CreateTenantProfileAsync(tenantId),
				await CreateTenantMemberAsync(otherTenantId)
			);
		}

		if (guardCase == TenantProfileUserGuardCase.StaffScopeProfile) {
			return (
				await CreateStaffProfileAsync(),
				await CreateTenantMemberAsync(tenantId)
			);
		}

		if (guardCase == TenantProfileUserGuardCase.StaffScopeAccount) {
			return (
				await CreateTenantProfileAsync(tenantId),
				await CreateStaffAccountAsync()
			);
		}

		if (guardCase == TenantProfileUserGuardCase.DeletedProfile) {
			// Assign first, then soft-delete the profile while leaving the link, so the spec
			// also proves the guard does not silently mutate the surviving row.
			var token = await _authClient.LoginAsStaffAdminAsync();
			var profileId = await CreateTenantProfileAsync(tenantId);
			var userAccountId = await CreateTenantMemberAsync(tenantId);
			await AssignAsync(token, tenantId, profileId, userAccountId);
			await SoftDeleteProfileLeavingLinksAsync(profileId);
			return (profileId, userAccountId);
		}

		if (guardCase == TenantProfileUserGuardCase.DeletedMember) {
			var profileId = await CreateTenantProfileAsync(tenantId);
			var userAccountId = await CreateTenantMemberAsync(tenantId, isDeleted: true);
			return (profileId, userAccountId);
		}

		throw new ArgumentOutOfRangeException(nameof(guardCase), guardCase, "Unhandled case");
	}

	private async Task<string> CreateStaffTokenWithPermissionsAsync(
		string emailPrefix,
		params string[] permissionKeys
	) {
		var email = $"{emailPrefix}-{Guid.NewGuid():N}@example.com";
		var userId = await StaffUserTestHelper.SeedStaffUserAsync(_fixture, email);

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var staffAccount = await (
			from account in dbContext.UserAccount
			where account.UserId == userId
				&& account.Scope == AccountScope.Staff
				&& !account.IsDeleted
			select account
		).FirstAsync();

		var profile = Profile.CreateStaffProfile(
			$"{emailPrefix}-permission-{Guid.NewGuid():N}",
			"Test-only staff profile for tenant profile member assignment permissions"
		);

		_ = dbContext.Profile.Add(profile);
		_ = await dbContext.SaveChangesAsync();

		foreach (var permissionKey in permissionKeys) {
			_ = dbContext.ProfilePermission.Add(new ProfilePermission {
				ProfileId = profile.GetRequiredId(),
				PermissionKey = permissionKey,
			});
		}

		_ = dbContext.UserAccountProfile.Add(new UserAccountProfile {
			UserAccountId = staffAccount.GetRequiredId(),
			ProfileId = profile.GetRequiredId(),
		});
		_ = await dbContext.SaveChangesAsync();

		return await _authClient.LoginAsync(email, TestConstants.SeedPassword);
	}

	private async Task AssignAsync(
		string staffToken,
		Guid tenantId,
		Guid profileId,
		Guid userAccountId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(tenantId.ToString(), profileId.ToString(), userAccountId.ToString())
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);
		response.EnsureSuccessStatusCode();
	}

	private async Task<Guid> GetTenantIdAsync(string tenantName) {
		var token = await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(_http, token, tenantName);
	}

	private async Task<Guid> CreateTenantProfileAsync(Guid tenantId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var profile = Profile.CreateTenantProfile(
			tenantId,
			name: "Tenant Profile " + Guid.NewGuid().ToString("N")[..8],
			description: "Profile created for member assignment tests"
		);
		profile.ValidateProfileType();

		_ = dbContext.Profile.Add(profile);
		_ = await dbContext.SaveChangesAsync();

		return profile.GetRequiredId();
	}

	private async Task<Guid> CreateStaffProfileAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var profile = Profile.CreateStaffProfile(
			name: "Staff Profile " + Guid.NewGuid().ToString("N")[..8],
			description: "Staff profile created for member assignment tests"
		);
		profile.ValidateProfileType();

		_ = dbContext.Profile.Add(profile);
		_ = await dbContext.SaveChangesAsync();

		return profile.GetRequiredId();
	}

	private async Task SoftDeleteProfileLeavingLinksAsync(Guid profileId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		// Raw SQL on purpose: the delete service would also purge the junction rows, and these
		// specs need the "dead profile, surviving link" state that quota and guard logic must
		// tolerate.
		_ = await dbContext.Database.ExecuteSqlAsync(
			$"""
			UPDATE profiles
			SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW()
			WHERE id = {profileId}
			"""
		);
	}

	private async Task<Guid> CreateStaffAccountAsync() {
		var email = $"staff-account-{Guid.NewGuid():N}@example.com";
		var userId = await StaffUserTestHelper.SeedStaffUserAsync(_fixture, email);

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
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
	/// accounts other specs also assign profiles to.
	/// </summary>
	private async Task<Guid> CreateTenantMemberAsync(
		Guid tenantId,
		AccountStatus status = AccountStatus.Active,
		bool isDeleted = false
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
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

		var account = new UserAccount {
			UserId = user.GetRequiredId(),
			TenantId = tenantId,
			Scope = AccountScope.Tenant,
			Level = AccountLevel.User,
			Status = status,
		};

		_ = dbContext.UserAccount.Add(account);
		_ = await dbContext.SaveChangesAsync();

		if (isDeleted) {
			account.IsDeleted = true;
			account.DeletedAt = DateTime.UtcNow;
			_ = await dbContext.SaveChangesAsync();
		}

		return account.GetRequiredId();
	}

	private async Task<int> CountAssignmentsAsync(Guid userAccountId, Guid profileId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.UserAccountProfile
			.Where(uap => uap.UserAccountId == userAccountId && uap.ProfileId == profileId)
			.CountAsync();
	}

	private async Task<int> CountLiveProfilesForMemberAsync(Guid userAccountId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await (
			from uap in dbContext.UserAccountProfile
			from p in dbContext.Profile
			where p.Id == uap.ProfileId
				&& uap.UserAccountId == userAccountId
				&& !p.IsDeleted
			select uap.ProfileId
		).CountAsync();
	}

	private async Task<int> CountAuditLogsAsync(Guid targetId, string? action = null) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.AuditLog
			.Where(log =>
				log.TargetId == targetId
				&& (action == null || log.Action == action)
			)
			.CountAsync();
	}

	private async Task<AuditLog?> GetLatestAuditLogAsync(string action, Guid targetId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.AuditLog
			.Where(log => log.Action == action && log.TargetId == targetId)
			.OrderByDescending(log => log.CreatedAt)
			.FirstOrDefaultAsync();
	}

	private static void AssertAuditDetails(
		AuditLog auditLog,
		Guid expectedTenantId,
		Guid expectedProfileId,
		Guid expectedUserAccountId
	) {
		auditLog.Details.Should().NotBeNull();
		Assert.NotNull(auditLog.Details);
		using var document = JsonDocument.Parse(auditLog.Details);
		var details = document.RootElement;

		details.GetProperty("TenantId").GetGuid().Should().Be(expectedTenantId);
		details.GetProperty("ProfileId").GetGuid().Should().Be(expectedProfileId);
		details.GetProperty("UserAccountId").GetGuid().Should().Be(expectedUserAccountId);
	}
}
