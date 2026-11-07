
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class FindTenantRoleUsersAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public FindTenantRoleUsersAsStaffSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _GetUrl(string tenantId, string roleId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Roles.ForTenantAsStaff.Users.FindFn(roleId)
		);
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
	// Authorization / malformed input
	// ---------------------------------------------------------------------------------------

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantRoleUsersAsStaffSpec._GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var token = await this._AuthClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantRoleUsersAsStaffSpec._GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantRoleUsersAsStaffSpec._GetUrl("not-a-guid", Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedRoleId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantRoleUsersAsStaffSpec._GetUrl(tenantId.ToString(), "not-a-guid")
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForNonExistentRole() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantRoleUsersAsStaffSpec._GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	// ---------------------------------------------------------------------------------------
	// Tenant isolation
	// ---------------------------------------------------------------------------------------

	/// <summary>
	/// A tenant role addressed through a foreign tenant's route must behave as not-found,
	/// exactly like every other tenant-role-as-staff read, rather than leaking the role's
	/// members across the tenant boundary.
	/// </summary>
	[Fact]
	public async Task ItShouldReturnNotFoundWhenRoleBelongsToAForeignTenant() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var ownerTenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var foreignTenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.TechStartName);

		var roleId = await this._CreateTenantRoleAsync(ownerTenantId);
		var userAccountId = await this._CreateTenantMemberAsync(ownerTenantId);
		await this._AssignAsync(token, ownerTenantId, roleId, userAccountId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantRoleUsersAsStaffSpec._GetUrl(foreignTenantId.ToString(), roleId.ToString())
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	/// <summary>
	/// Direct structural proof of tenant isolation: two tenants each get a role with an
	/// assigned member. Listing tenant A's role must return exactly tenant A's member, never
	/// tenant B's — even though both members were created and assigned in the same test run.
	/// </summary>
	[Fact]
	public async Task ItShouldNeverListMembersFromAForeignTenant() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantAId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var tenantBId = await this._GetTenantIdAsync(SeedConstants.Tenants.TechStartName);

		var roleAId = await this._CreateTenantRoleAsync(tenantAId);
		var memberAId = await this._CreateTenantMemberAsync(tenantAId);
		await this._AssignAsync(token, tenantAId, roleAId, memberAId);

		var roleBId = await this._CreateTenantRoleAsync(tenantBId);
		var memberBId = await this._CreateTenantMemberAsync(tenantBId);
		await this._AssignAsync(token, tenantBId, roleBId, memberBId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantRoleUsersAsStaffSpec._GetUrl(tenantAId.ToString(), roleAId.ToString()) + "?limit=50"
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindTenantRoleUsersAsStaffResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Users.Should().ContainSingle(u => u.Id == memberAId);
		result.Users.Should().NotContain(u => u.Id == memberBId);
	}

	/// <summary>
	/// Mutation-proof isolation check: seeds a UserAccountRole row directly (bypassing the
	/// assign endpoint, which itself enforces tenant matching) to represent corrupt/legacy
	/// cross-tenant data — a tenant B account linked to tenant A's role. Find must still
	/// exclude that account. The named "foreign tenant" spec above passes even if the service's
	/// `ua.TenantId == args.TenantId` predicate were deleted, because the role-id filter
	/// alone already excludes tenant B's member from tenant A's role query — this test seeds
	/// the corrupt row specifically so the role-id filter can no longer save the assertion,
	/// leaving only the account-tenant predicate to guard it.
	/// </summary>
	[Fact]
	public async Task ItShouldExcludeAForeignTenantAccountEvenWithACorruptJunctionRow() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantAId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var tenantBId = await this._GetTenantIdAsync(SeedConstants.Tenants.TechStartName);

		var roleAId = await this._CreateTenantRoleAsync(tenantAId);
		var foreignMemberId = await this._CreateTenantMemberAsync(tenantBId);
		await this._CreateCorruptCrossTenantJunctionRowAsync(foreignMemberId, roleAId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantRoleUsersAsStaffSpec._GetUrl(tenantAId.ToString(), roleAId.ToString()) + "?limit=50"
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindTenantRoleUsersAsStaffResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Users.Should().NotContain(u => u.Id == foreignMemberId);
	}

	// ---------------------------------------------------------------------------------------
	// Pagination determinism
	// ---------------------------------------------------------------------------------------

	/// <summary>
	/// Every Find sort branch ties routinely (all seeded members here share the default Active
	/// status). Without a unique UserAccountId tie-breaker matching the primary sort direction,
	/// Postgres may return tied rows in a different order across the two page requests below,
	/// so adjacent offset pages could overlap or omit members. Seeding limit+1 tied members and
	/// asserting the two-page union is exact (no overlap, nothing skipped) proves the
	/// tie-breaker is in place.
	/// </summary>
	[Fact]
	public async Task ItShouldPageWithoutOverlapOrGapsWhenManyMembersTieOnStatus() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);

		const int limit = 5;
		var memberIds = new List<Guid>();
		for (var i = 0; i < limit + 1; i++) {
			var memberId = await this._CreateTenantMemberAsync(tenantId);
			await this._AssignAsync(token, tenantId, roleId, memberId);
			memberIds.Add(memberId);
		}

		var page1 = await this._GetUsersPageAsync(
			token, tenantId, roleId, page: 1, limit: limit, sortId: "status"
		);
		var page2 = await this._GetUsersPageAsync(
			token, tenantId, roleId, page: 2, limit: limit, sortId: "status"
		);

		var page1Ids = page1.Users.Select(u => u.Id).ToList();
		var page2Ids = page2.Users.Select(u => u.Id).ToList();

		page1Ids.Should().HaveCount(limit);
		page2Ids.Should().HaveCount(1);
		page1Ids.Intersect(page2Ids).Should().BeEmpty();

		page1Ids.Concat(page2Ids).Should().BeEquivalentTo(memberIds);
	}

	// ---------------------------------------------------------------------------------------
	// Happy paths
	// ---------------------------------------------------------------------------------------

	[Fact]
	public async Task ItShouldReturnAssignedMembersOnly() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);

		var assignedMemberId = await this._CreateTenantMemberAsync(tenantId);
		var unassignedMemberId = await this._CreateTenantMemberAsync(tenantId);
		await this._AssignAsync(token, tenantId, roleId, assignedMemberId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantRoleUsersAsStaffSpec._GetUrl(tenantId.ToString(), roleId.ToString()) + "?limit=50"
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindTenantRoleUsersAsStaffResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Users.Should().Contain(u => u.Id == assignedMemberId);
		result.Users.Should().NotContain(u => u.Id == unassignedMemberId);
	}

	[Fact]
	public async Task ItShouldExposeOtherRolesAndTheCurrentAssignmentTimestamp() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var currentRoleId = await this._CreateTenantRoleAsync(
			tenantId,
			"Current role"
		);
		var otherRoleAId = await this._CreateTenantRoleAsync(
			tenantId,
			"Other role A"
		);
		var otherRoleBId = await this._CreateTenantRoleAsync(
			tenantId,
			"Other role B"
		);
		var memberWithOtherRolesId = await this._CreateTenantMemberAsync(tenantId);
		var memberWithOnlyCurrentRoleId = await this._CreateTenantMemberAsync(tenantId);
		var joinedAt = new DateTime(2026, 2, 3, 4, 5, 6, DateTimeKind.Utc);

		await this._CreateAssignmentAsync(
			memberWithOtherRolesId,
			currentRoleId,
			joinedAt
		);
		await this._CreateAssignmentAsync(
			memberWithOtherRolesId,
			otherRoleAId,
			joinedAt.AddDays(1)
		);
		await this._CreateAssignmentAsync(
			memberWithOtherRolesId,
			otherRoleBId,
			joinedAt.AddDays(2)
		);
		await this._CreateAssignmentAsync(
			memberWithOnlyCurrentRoleId,
			currentRoleId,
			joinedAt.AddDays(3)
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantRoleUsersAsStaffSpec._GetUrl(tenantId.ToString(), currentRoleId.ToString()) + "?limit=50"
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindTenantRoleUsersAsStaffResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		var memberWithOtherRoles = result.Users
			.Should()
			.ContainSingle(u => u.Id == memberWithOtherRolesId)
			.Subject;
		memberWithOtherRoles.JoinedAt.Should().Be(joinedAt);
		memberWithOtherRoles.OtherRoles.Should().BeEquivalentTo([
			new TenantRoleUserRoleItemResponse(otherRoleAId, "Other role A"),
			new TenantRoleUserRoleItemResponse(otherRoleBId, "Other role B"),
		]);
		memberWithOtherRoles.OtherRoles.Should()
			.NotContain(role => role.Id == currentRoleId);

		var memberWithOnlyCurrentRole = result.Users
			.Should()
			.ContainSingle(u => u.Id == memberWithOnlyCurrentRoleId)
			.Subject;
		memberWithOnlyCurrentRole.JoinedAt.Should().Be(joinedAt.AddDays(3));
		memberWithOnlyCurrentRole.OtherRoles.Should().BeEmpty();
	}

	/// <summary>
	/// Regression for the front-2 step-4b review (MAJOR 4): the roster's `id` is deliberately
	/// the user_account_id (matching the assign/unassign toggle route), but a caller that wants
	/// to link to the member's own detail page needs the DISTINCT global user id. This pins that
	/// both are present and not equal, so a caller can never mistake one for the other.
	/// </summary>
	[Fact]
	public async Task ItShouldExposeBothTheUserAccountIdAndTheDistinctGlobalUserId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);

		var (userAccountId, userId) = await this._CreateTenantMemberWithUserIdAsync(tenantId);
		await this._AssignAsync(token, tenantId, roleId, userAccountId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantRoleUsersAsStaffSpec._GetUrl(tenantId.ToString(), roleId.ToString()) + "?limit=50"
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindTenantRoleUsersAsStaffResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		var item = result.Users.Should().ContainSingle(u => u.Id == userAccountId).Subject;
		item.UserId.Should().Be(userId);
		item.UserId.Should().NotBe(item.Id);
	}

	[Fact]
	public async Task ItShouldSupportSearchByQ() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);

		var alphaEmail = $"alpha.tenant-role-{Guid.NewGuid():N}@example.com";
		var betaEmail = $"beta.tenant-role-{Guid.NewGuid():N}@example.com";

		var alphaMemberId = await this._CreateTenantMemberAsync(tenantId, email: alphaEmail);
		var betaMemberId = await this._CreateTenantMemberAsync(tenantId, email: betaEmail);

		await this._AssignAsync(token, tenantId, roleId, alphaMemberId);
		await this._AssignAsync(token, tenantId, roleId, betaMemberId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantRoleUsersAsStaffSpec._GetUrl(tenantId.ToString(), roleId.ToString()) + "?limit=50&q=alpha.tenant-role"
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindTenantRoleUsersAsStaffResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Users.Should().Contain(u =>
			string.Equals(u.Email, alphaEmail, StringComparison.OrdinalIgnoreCase)
		);
		result.Users.Should().NotContain(u =>
			string.Equals(u.Email, betaEmail, StringComparison.OrdinalIgnoreCase)
		);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForInvalidSortId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantRoleUsersAsStaffSpec._GetUrl(tenantId.ToString(), roleId.ToString()) + "?limit=50&sort_id=not_real"
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldSortByEmailAscending() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);

		var emailA = $"a.tenant-sort-{Guid.NewGuid():N}@example.com";
		var emailB = $"b.tenant-sort-{Guid.NewGuid():N}@example.com";

		var memberB = await this._CreateTenantMemberAsync(tenantId, email: emailB);
		var memberA = await this._CreateTenantMemberAsync(tenantId, email: emailA);

		await this._AssignAsync(token, tenantId, roleId, memberB);
		await this._AssignAsync(token, tenantId, roleId, memberA);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantRoleUsersAsStaffSpec._GetUrl(tenantId.ToString(), roleId.ToString())
				+ "?limit=50&sort_id=email&sort_order=asc"
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindTenantRoleUsersAsStaffResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Users.Select(u => u.Email).Should().BeInAscendingOrder();
	}

	[Fact]
	public async Task ItShouldAcceptAllSupportedSortIds() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);
		var memberId = await this._CreateTenantMemberAsync(tenantId);
		await this._AssignAsync(token, tenantId, roleId, memberId);

		var sortIds = new[] {
			"created_at", "email", "first_name", "last_name", "status", "is_full_access",
		};
		foreach (var sortId in sortIds) {
			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				FindTenantRoleUsersAsStaffSpec._GetUrl(tenantId.ToString(), roleId.ToString())
					+ $"?limit=50&sort_id={sortId}&sort_order=desc"
			).WithSessionToken(token);

			using var response = await this._Http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.OK);
		}
	}

	/// <summary>
	/// Regression for the front-2 step-4b review (MAJOR 5): the Members-roster role column
	/// sorts client-side by emitting sort_id=is_full_access, which this endpoint used to reject
	/// with 400. Descending order must place full-access members before restricted ones.
	/// </summary>
	[Fact]
	public async Task ItShouldSortByFullAccessDescending() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);

		var fullAccessMemberId = await this._CreateTenantMemberAsync(tenantId, fullAccess: true);
		var restrictedMemberId = await this._CreateTenantMemberAsync(tenantId);

		await this._AssignAsync(token, tenantId, roleId, fullAccessMemberId);
		await this._AssignAsync(token, tenantId, roleId, restrictedMemberId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantRoleUsersAsStaffSpec._GetUrl(tenantId.ToString(), roleId.ToString())
				+ "?limit=50&sort_id=is_full_access&sort_order=desc"
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindTenantRoleUsersAsStaffResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		var fullAccessIndex = result.Users.FindIndex(u => u.Id == fullAccessMemberId);
		var restrictedIndex = result.Users.FindIndex(u => u.Id == restrictedMemberId);
		fullAccessIndex.Should().BeGreaterThanOrEqualTo(0);
		restrictedIndex.Should().BeGreaterThanOrEqualTo(0);
		fullAccessIndex.Should().BeLessThan(restrictedIndex);

		result.Users.Single(u => u.Id == fullAccessMemberId)
			.IsFullAccess.Should().BeTrue();
		result.Users.Single(u => u.Id == restrictedMemberId)
			.IsFullAccess.Should().BeFalse();
	}

	/// <summary>
	/// Suspension is not removal: staff must still see a suspended member's assignments, mirroring
	/// the staff-roles Find precedent's explicit choice not to hide suspended rows.
	/// </summary>
	[Fact]
	public async Task ItShouldIncludeSuspendedMembers() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);
		var memberId = await this._CreateTenantMemberAsync(tenantId);

		await this._AssignAsync(token, tenantId, roleId, memberId);
		await this._SetMemberAccountStatusAsync(memberId, AccountStatus.Suspended);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantRoleUsersAsStaffSpec._GetUrl(tenantId.ToString(), roleId.ToString()) + "?limit=50"
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindTenantRoleUsersAsStaffResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		var member = result.Users.Should().ContainSingle(u => u.Id == memberId).Subject;
		member.Status.Should().Be("Suspended");
	}

	// ---------------------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------------------

	private async Task<Guid> _GetTenantIdAsync(string tenantName) {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(this._Http, token, tenantName);
	}

	private async Task<Guid> _CreateTenantRoleAsync(
		Guid tenantId,
		string? name = null
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var role = Role.CreateTenantRole(
			tenantId,
			name: name ?? ("Tenant Role " + Guid.NewGuid().ToString("N")[..8]),
			description: "Role created for FindTenantRoleUsersAsStaffSpec"
		);
		role.ValidateRoleType();

		_ = dbContext.Role.Add(role);
		_ = await dbContext.SaveChangesAsync();

		return role.GetRequiredId();
	}

	private async Task _CreateAssignmentAsync(
		Guid userAccountId,
		Guid roleId,
		DateTime createdAt
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		_ = dbContext.UserAccountRole.Add(new UserAccountRole {
			UserAccountId = userAccountId,
			RoleId = roleId,
			CreatedAt = createdAt,
			UpdatedAt = createdAt,
		});
		_ = await dbContext.SaveChangesAsync();
	}

	private async Task<Guid> _CreateTenantMemberAsync(
		Guid tenantId,
		string? email = null,
		bool fullAccess = false
	) {
		var (userAccountId, _) = await this._CreateTenantMemberWithUserIdAsync(
			tenantId, email, fullAccess
		);
		return userAccountId;
	}

	/// <summary>
	/// Same seeding as <see cref="_CreateTenantMemberAsync"/>, but also returns the underlying
	/// global user id — needed by identity-distinctness assertions (BLOCKER 1 regression) that
	/// must confirm the response's `userId` differs from its `id` (the user_account_id).
	/// </summary>
	private async Task<(Guid UserAccountId, Guid UserId)> _CreateTenantMemberWithUserIdAsync(
		Guid tenantId,
		string? email = null,
		bool fullAccess = false
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var suffix = Guid.NewGuid().ToString("N")[..8];
		var user = new User {
			Email = email ?? $"member-{suffix}@example.com",
			Password = "hash",
			FirstName = "Find",
			LastName = "Member",
			Status = UserStatus.Active,
			IsVerified = true
		};

		_ = dbContext.User.Add(user);
		_ = await dbContext.SaveChangesAsync();

		var account = UserAccount.CreateTenantAccount(user.GetRequiredId(), tenantId);
		account.ValidateAccountType();

		_ = dbContext.UserAccount.Add(account);
		_ = await dbContext.SaveChangesAsync();

		if (fullAccess) {
			await FullAccessRoleTestHelper.MakeTenantFullAccessAsync(
				dbContext,
				tenantId,
				account.GetRequiredId()
			);
		}

		return (account.GetRequiredId(), user.GetRequiredId());
	}

	private async Task _SetMemberAccountStatusAsync(Guid userAccountId, AccountStatus status) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var account = await dbContext.UserAccount.FindAsync(userAccountId);
		if (account is null) {
			throw new InvalidOperationException("UserAccount not found for status update");
		}

		account.Status = status;
		_ = await dbContext.SaveChangesAsync();
	}

	private async Task _AssignAsync(
		string staffToken,
		Guid tenantId,
		Guid roleId,
		Guid userAccountId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			FindTenantRoleUsersAsStaffSpec._GetToggleUrl(tenantId.ToString(), roleId.ToString(), userAccountId.ToString())
		).WithSessionToken(staffToken);

		using var response = await this._Http.SendAsync(request);
		response.EnsureSuccessStatusCode();
	}

	/// <summary>
	/// Inserts a UserAccountRole junction row directly via the DbContext, bypassing the
	/// assign endpoint (which itself enforces tenant matching). Used to represent corrupt/legacy
	/// cross-tenant data for isolation specs that must exercise the service's account-tenant
	/// predicate rather than relying on the role-id filter alone.
	/// </summary>
	private async Task _CreateCorruptCrossTenantJunctionRowAsync(Guid userAccountId, Guid roleId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		_ = dbContext.UserAccountRole.Add(new UserAccountRole {
			UserAccountId = userAccountId,
			RoleId = roleId,
		});
		_ = await dbContext.SaveChangesAsync();
	}

	private async Task<FindTenantRoleUsersAsStaffResponse> _GetUsersPageAsync(
		string staffToken,
		Guid tenantId,
		Guid roleId,
		int page,
		int limit,
		string sortId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantRoleUsersAsStaffSpec._GetUrl(tenantId.ToString(), roleId.ToString())
				+ $"?page={page}&limit={limit}&sort_id={sortId}&sort_order=desc"
		).WithSessionToken(staffToken);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindTenantRoleUsersAsStaffResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		return result;
	}

	// -- Response DTOs --

	private record FindTenantRoleUsersAsStaffResponse {
		public List<TenantRoleUserItemResponse> Users { get; init; } = [];
		public int Count { get; init; }
	}

	private record TenantRoleUserItemResponse {
		public Guid Id { get; init; }
		public Guid UserId { get; init; }
		public string Email { get; init; } = string.Empty;
		public string? LastName { get; init; }
		public string? FirstName { get; init; }
		public string? AvatarUrl { get; init; }
		public string Status { get; init; } = string.Empty;
		public bool IsFullAccess { get; init; }
		public List<TenantRoleUserRoleItemResponse> OtherRoles { get; init; } = [];
		public DateTime? JoinedAt { get; init; }
	}

	private sealed record TenantRoleUserRoleItemResponse(Guid Id, string Name);
}
