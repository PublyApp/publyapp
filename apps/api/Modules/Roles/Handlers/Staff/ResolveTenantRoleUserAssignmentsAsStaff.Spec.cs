
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

public sealed class ResolveTenantRoleUserAssignmentsAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public ResolveTenantRoleUserAssignmentsAsStaffSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _GetUrl(string tenantId, string roleId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Roles.ForTenantAsStaff.Users.ResolveAssignmentFn(roleId)
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

		using var response = await this._Http.PostAsJsonAsync(
			ResolveTenantRoleUserAssignmentsAsStaffSpec._GetUrl(tenantId.ToString(), Guid.NewGuid().ToString()),
			new { userAccountIds = new[] { Guid.NewGuid().ToString() } }
		);

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
			HttpMethod.Post,
			ResolveTenantRoleUserAssignmentsAsStaffSpec._GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { userAccountIds = new[] { Guid.NewGuid().ToString() } }
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			ResolveTenantRoleUserAssignmentsAsStaffSpec._GetUrl("not-a-guid", Guid.NewGuid().ToString())
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { userAccountIds = new[] { Guid.NewGuid().ToString() } }
		);

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
			HttpMethod.Post,
			ResolveTenantRoleUserAssignmentsAsStaffSpec._GetUrl(tenantId.ToString(), "not-a-guid")
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { userAccountIds = new[] { Guid.NewGuid().ToString() } }
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemForMalformedUserAccountId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			ResolveTenantRoleUserAssignmentsAsStaffSpec._GetUrl(tenantId.ToString(), roleId.ToString())
		).WithSessionToken(token);

		string[] malformedUserAccountIds = ["not-a-guid"];
		request.Content = JsonContent.Create(
			new { userAccountIds = malformedUserAccountIds }
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundWhenRoleDoesNotExist() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			ResolveTenantRoleUserAssignmentsAsStaffSpec._GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { userAccountIds = new[] { Guid.NewGuid().ToString() } }
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	// ---------------------------------------------------------------------------------------
	// Tenant isolation
	// ---------------------------------------------------------------------------------------

	/// <summary>
	/// A tenant role addressed through a foreign tenant's route must behave as not-found,
	/// mirroring the Find endpoint's guard.
	/// </summary>
	[Fact]
	public async Task ItShouldReturnNotFoundWhenRoleBelongsToAForeignTenant() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var ownerTenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var foreignTenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.TechStartName);
		var roleId = await this._CreateTenantRoleAsync(ownerTenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			ResolveTenantRoleUserAssignmentsAsStaffSpec._GetUrl(foreignTenantId.ToString(), roleId.ToString())
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { userAccountIds = new[] { Guid.NewGuid().ToString() } }
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	/// <summary>
	/// A member account belonging to a different tenant than the role must never resolve as
	/// assigned, even when queried through the owning tenant's own route. This is the isolation
	/// case that matters: without the account-scope/tenant filter in the service query, a stray
	/// cross-tenant id in the batch could otherwise leak a "true".
	/// </summary>
	[Fact]
	public async Task ItShouldNotResolveAForeignTenantAccountAsAssigned() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantAId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var tenantBId = await this._GetTenantIdAsync(SeedConstants.Tenants.TechStartName);

		var roleAId = await this._CreateTenantRoleAsync(tenantAId);
		var foreignMemberId = await this._CreateTenantMemberAsync(tenantBId);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			ResolveTenantRoleUserAssignmentsAsStaffSpec._GetUrl(tenantAId.ToString(), roleAId.ToString())
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { userAccountIds = new[] { foreignMemberId.ToString() } }
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<ResolveTenantRoleUserAssignmentsAsStaffResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Assignments.Should().ContainSingle(a =>
			a.UserAccountId == foreignMemberId && !a.IsAssigned
		);
	}

	/// <summary>
	/// Mutation-proof isolation check: the spec above creates the foreign member with NO
	/// assignment at all, so it would pass even if the service's `ua.TenantId == args.TenantId`
	/// predicate were deleted — the join is empty and false regardless. This test seeds a
	/// UserAccountRole row directly (bypassing the assign endpoint, which itself enforces
	/// tenant matching) to represent corrupt/legacy cross-tenant data — a tenant B account
	/// linked to tenant A's role — so only the account-tenant predicate can keep the result
	/// false.
	/// </summary>
	[Fact]
	public async Task ItShouldNotResolveAForeignTenantAccountAsAssignedEvenWithACorruptJunctionRow() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantAId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var tenantBId = await this._GetTenantIdAsync(SeedConstants.Tenants.TechStartName);

		var roleAId = await this._CreateTenantRoleAsync(tenantAId);
		var foreignMemberId = await this._CreateTenantMemberAsync(tenantBId);
		await this._CreateCorruptCrossTenantJunctionRowAsync(foreignMemberId, roleAId);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			ResolveTenantRoleUserAssignmentsAsStaffSpec._GetUrl(tenantAId.ToString(), roleAId.ToString())
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { userAccountIds = new[] { foreignMemberId.ToString() } }
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<ResolveTenantRoleUserAssignmentsAsStaffResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Assignments.Should().ContainSingle(a =>
			a.UserAccountId == foreignMemberId && !a.IsAssigned
		);
	}

	// ---------------------------------------------------------------------------------------
	// Happy paths
	// ---------------------------------------------------------------------------------------

	[Fact]
	public async Task ItShouldResolveAssignmentsForRequestedUsers() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);

		var assignedMemberId = await this._CreateTenantMemberAsync(tenantId);
		var unassignedMemberId = await this._CreateTenantMemberAsync(tenantId);
		await this._AssignAsync(token, tenantId, roleId, assignedMemberId);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			ResolveTenantRoleUserAssignmentsAsStaffSpec._GetUrl(tenantId.ToString(), roleId.ToString())
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new {
				userAccountIds = new[] {
					assignedMemberId.ToString(),
					unassignedMemberId.ToString(),
				}
			}
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<ResolveTenantRoleUserAssignmentsAsStaffResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Assignments.Should().ContainSingle(a =>
			a.UserAccountId == assignedMemberId && a.IsAssigned
		);
		result.Assignments.Should().ContainSingle(a =>
			a.UserAccountId == unassignedMemberId && !a.IsAssigned
		);
	}

	/// <summary>
	/// Resolve must report assignment TRUTH, not eligibility: a suspended account with a live
	/// junction row must still resolve as assigned. Find already returns suspended members, and
	/// the tenant toggle service (TenantMembershipLockOrder.LockLiveTenantAccountAsync)
	/// deliberately accepts suspended accounts for both assign and unassign — so excluding
	/// suspended accounts here would make an existing assignment resolve as IsAssigned: false,
	/// and the assignment could never be removed through that state (the drawer would show an
	/// unchecked switch and offer POST instead of DELETE). This replaces the previous
	/// "exclude suspended" assertion, which encoded the staff-axis bug this slice must not
	/// mirror.
	/// </summary>
	[Fact]
	public async Task ItShouldResolveASuspendedAccountWithALiveJunctionRowAsAssigned() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);

		var suspendedMemberId = await this._CreateTenantMemberAsync(tenantId);
		await this._AssignAsync(token, tenantId, roleId, suspendedMemberId);
		await this._SetMemberAccountStatusAsync(suspendedMemberId, AccountStatus.Suspended);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			ResolveTenantRoleUserAssignmentsAsStaffSpec._GetUrl(tenantId.ToString(), roleId.ToString())
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { userAccountIds = new[] { suspendedMemberId.ToString() } }
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<ResolveTenantRoleUserAssignmentsAsStaffResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Assignments.Should().ContainSingle(a =>
			a.UserAccountId == suspendedMemberId && a.IsAssigned
		);
	}

	[Fact]
	public async Task ItShouldReturnEmptyAssignmentsForEmptyRequest() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var roleId = await this._CreateTenantRoleAsync(tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			ResolveTenantRoleUserAssignmentsAsStaffSpec._GetUrl(tenantId.ToString(), roleId.ToString())
		).WithSessionToken(token);

		request.Content = JsonContent.Create(new { userAccountIds = Array.Empty<string>() });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<ResolveTenantRoleUserAssignmentsAsStaffResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Assignments.Should().BeEmpty();
	}

	// ---------------------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------------------

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
			description: "Role created for ResolveTenantRoleUserAssignmentsAsStaffSpec"
		);
		role.ValidateRoleType();

		_ = dbContext.Role.Add(role);
		_ = await dbContext.SaveChangesAsync();

		return role.GetRequiredId();
	}

	private async Task<Guid> _CreateTenantMemberAsync(Guid tenantId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var suffix = Guid.NewGuid().ToString("N")[..8];
		var user = new User {
			Email = $"member-{suffix}@example.com",
			Password = "hash",
			FirstName = "Resolve",
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

		return account.GetRequiredId();
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
			ResolveTenantRoleUserAssignmentsAsStaffSpec._GetToggleUrl(tenantId.ToString(), roleId.ToString(), userAccountId.ToString())
		).WithSessionToken(staffToken);

		using var response = await this._Http.SendAsync(request);
		response.EnsureSuccessStatusCode();
	}

	/// <summary>
	/// Inserts a UserAccountRole junction row directly via the DbContext, bypassing the
	/// assign endpoint (which itself enforces tenant matching). Used to represent corrupt/legacy
	/// cross-tenant data for isolation specs that must exercise the service's account-tenant
	/// predicate rather than relying on an otherwise-empty join.
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
}
