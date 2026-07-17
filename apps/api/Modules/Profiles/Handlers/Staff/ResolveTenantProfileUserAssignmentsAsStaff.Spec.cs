
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
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public sealed class ResolveTenantProfileUserAssignmentsAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public ResolveTenantProfileUserAssignmentsAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl(string tenantId, string profileId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Profiles.ForTenantAsStaff.Users.ResolveAssignmentFn(profileId)
		);
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
	// Authorization / malformed input
	// ---------------------------------------------------------------------------------------

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);

		using var response = await _http.PostAsJsonAsync(
			GetUrl(tenantId.ToString(), Guid.NewGuid().ToString()),
			new { userAccountIds = new[] { Guid.NewGuid().ToString() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var token = await _authClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { userAccountIds = new[] { Guid.NewGuid().ToString() } }
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl("not-a-guid", Guid.NewGuid().ToString())
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { userAccountIds = new[] { Guid.NewGuid().ToString() } }
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedProfileId() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString(), "not-a-guid")
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { userAccountIds = new[] { Guid.NewGuid().ToString() } }
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemForMalformedUserAccountId() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString(), profileId.ToString())
		).WithSessionToken(token);

		string[] malformedUserAccountIds = ["not-a-guid"];
		request.Content = JsonContent.Create(
			new { userAccountIds = malformedUserAccountIds }
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundWhenProfileDoesNotExist() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { userAccountIds = new[] { Guid.NewGuid().ToString() } }
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	// ---------------------------------------------------------------------------------------
	// Tenant isolation
	// ---------------------------------------------------------------------------------------

	/// <summary>
	/// A tenant profile addressed through a foreign tenant's route must behave as not-found,
	/// mirroring the Find endpoint's guard.
	/// </summary>
	[Fact]
	public async Task ItShouldReturnNotFoundWhenProfileBelongsToAForeignTenant() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var ownerTenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var foreignTenantId = await GetTenantIdAsync(SeedConstants.Tenants.TechStartName);
		var profileId = await CreateTenantProfileAsync(ownerTenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(foreignTenantId.ToString(), profileId.ToString())
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { userAccountIds = new[] { Guid.NewGuid().ToString() } }
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	/// <summary>
	/// A member account belonging to a different tenant than the profile must never resolve as
	/// assigned, even when queried through the owning tenant's own route. This is the isolation
	/// case that matters: without the account-scope/tenant filter in the service query, a stray
	/// cross-tenant id in the batch could otherwise leak a "true".
	/// </summary>
	[Fact]
	public async Task ItShouldNotResolveAForeignTenantAccountAsAssigned() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantAId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var tenantBId = await GetTenantIdAsync(SeedConstants.Tenants.TechStartName);

		var profileAId = await CreateTenantProfileAsync(tenantAId);
		var foreignMemberId = await CreateTenantMemberAsync(tenantBId);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantAId.ToString(), profileAId.ToString())
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { userAccountIds = new[] { foreignMemberId.ToString() } }
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<ResolveTenantProfileUserAssignmentsAsStaffResult>();
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
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);

		var assignedMemberId = await CreateTenantMemberAsync(tenantId);
		var unassignedMemberId = await CreateTenantMemberAsync(tenantId);
		await AssignAsync(token, tenantId, profileId, assignedMemberId);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString(), profileId.ToString())
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new {
				userAccountIds = new[] {
					assignedMemberId.ToString(),
					unassignedMemberId.ToString(),
				}
			}
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<ResolveTenantProfileUserAssignmentsAsStaffResult>();
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
	/// Mirrors the staff-profiles ResolveAssignment precedent: suspended members/users are
	/// treated as not assignable via staff tooling, even though the Find endpoint still lists
	/// them.
	/// </summary>
	[Fact]
	public async Task ItShouldExcludeSuspendedAccountsFromResolvedAssignments() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);

		var suspendedMemberId = await CreateTenantMemberAsync(tenantId);
		await AssignAsync(token, tenantId, profileId, suspendedMemberId);
		await SetMemberAccountStatusAsync(suspendedMemberId, AccountStatus.Suspended);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString(), profileId.ToString())
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { userAccountIds = new[] { suspendedMemberId.ToString() } }
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<ResolveTenantProfileUserAssignmentsAsStaffResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Assignments.Should().ContainSingle(a =>
			a.UserAccountId == suspendedMemberId && !a.IsAssigned
		);
	}

	[Fact]
	public async Task ItShouldReturnEmptyAssignmentsForEmptyRequest() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUrl(tenantId.ToString(), profileId.ToString())
		).WithSessionToken(token);

		request.Content = JsonContent.Create(new { userAccountIds = Array.Empty<string>() });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<ResolveTenantProfileUserAssignmentsAsStaffResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Assignments.Should().BeEmpty();
	}

	// ---------------------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------------------

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
			description: "Profile created for ResolveTenantProfileUserAssignmentsAsStaffSpec"
		);
		profile.ValidateProfileType();

		_ = dbContext.Profile.Add(profile);
		_ = await dbContext.SaveChangesAsync();

		return profile.GetRequiredId();
	}

	private async Task<Guid> CreateTenantMemberAsync(Guid tenantId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
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

		var account = new UserAccount {
			UserId = user.GetRequiredId(),
			TenantId = tenantId,
			Scope = AccountScope.Tenant,
			Level = AccountLevel.User,
			Status = AccountStatus.Active,
		};

		_ = dbContext.UserAccount.Add(account);
		_ = await dbContext.SaveChangesAsync();

		return account.GetRequiredId();
	}

	private async Task SetMemberAccountStatusAsync(Guid userAccountId, AccountStatus status) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var account = await dbContext.UserAccount.FindAsync(userAccountId);
		if (account is null) {
			throw new InvalidOperationException("UserAccount not found for status update");
		}

		account.Status = status;
		_ = await dbContext.SaveChangesAsync();
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
}
