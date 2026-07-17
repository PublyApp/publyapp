
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

public sealed class FindTenantProfileUsersAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindTenantProfileUsersAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl(string tenantId, string profileId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Profiles.ForTenantAsStaff.Users.FindFn(profileId)
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

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		);

		using var response = await _http.SendAsync(request);
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
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl("not-a-guid", Guid.NewGuid().ToString())
		).WithSessionToken(token);

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
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), "not-a-guid")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForNonExistentProfile() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	// ---------------------------------------------------------------------------------------
	// Tenant isolation
	// ---------------------------------------------------------------------------------------

	/// <summary>
	/// A tenant profile addressed through a foreign tenant's route must behave as not-found,
	/// exactly like every other tenant-profile-as-staff read, rather than leaking the profile's
	/// members across the tenant boundary.
	/// </summary>
	[Fact]
	public async Task ItShouldReturnNotFoundWhenProfileBelongsToAForeignTenant() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var ownerTenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var foreignTenantId = await GetTenantIdAsync(SeedConstants.Tenants.TechStartName);

		var profileId = await CreateTenantProfileAsync(ownerTenantId);
		var userAccountId = await CreateTenantMemberAsync(ownerTenantId);
		await AssignAsync(token, ownerTenantId, profileId, userAccountId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(foreignTenantId.ToString(), profileId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	/// <summary>
	/// Direct structural proof of tenant isolation: two tenants each get a profile with an
	/// assigned member. Listing tenant A's profile must return exactly tenant A's member, never
	/// tenant B's — even though both members were created and assigned in the same test run.
	/// </summary>
	[Fact]
	public async Task ItShouldNeverListMembersFromAForeignTenant() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantAId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var tenantBId = await GetTenantIdAsync(SeedConstants.Tenants.TechStartName);

		var profileAId = await CreateTenantProfileAsync(tenantAId);
		var memberAId = await CreateTenantMemberAsync(tenantAId);
		await AssignAsync(token, tenantAId, profileAId, memberAId);

		var profileBId = await CreateTenantProfileAsync(tenantBId);
		var memberBId = await CreateTenantMemberAsync(tenantBId);
		await AssignAsync(token, tenantBId, profileBId, memberBId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantAId.ToString(), profileAId.ToString()) + "?limit=50"
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindTenantProfileUsersAsStaffResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Users.Should().ContainSingle(u => u.Id == memberAId);
		result.Users.Should().NotContain(u => u.Id == memberBId);
	}

	// ---------------------------------------------------------------------------------------
	// Happy paths
	// ---------------------------------------------------------------------------------------

	[Fact]
	public async Task ItShouldReturnAssignedMembersOnly() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);

		var assignedMemberId = await CreateTenantMemberAsync(tenantId);
		var unassignedMemberId = await CreateTenantMemberAsync(tenantId);
		await AssignAsync(token, tenantId, profileId, assignedMemberId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), profileId.ToString()) + "?limit=50"
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindTenantProfileUsersAsStaffResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Users.Should().Contain(u => u.Id == assignedMemberId);
		result.Users.Should().NotContain(u => u.Id == unassignedMemberId);
	}

	[Fact]
	public async Task ItShouldSupportSearchByQ() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);

		var alphaEmail = $"alpha.tenant-profile-{Guid.NewGuid():N}@example.com";
		var betaEmail = $"beta.tenant-profile-{Guid.NewGuid():N}@example.com";

		var alphaMemberId = await CreateTenantMemberAsync(tenantId, email: alphaEmail);
		var betaMemberId = await CreateTenantMemberAsync(tenantId, email: betaEmail);

		await AssignAsync(token, tenantId, profileId, alphaMemberId);
		await AssignAsync(token, tenantId, profileId, betaMemberId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), profileId.ToString()) + "?limit=50&q=alpha.tenant-profile"
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindTenantProfileUsersAsStaffResponse>();
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
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), profileId.ToString()) + "?limit=50&sort_id=not_real"
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldSortByEmailAscending() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);

		var emailA = $"a.tenant-sort-{Guid.NewGuid():N}@example.com";
		var emailB = $"b.tenant-sort-{Guid.NewGuid():N}@example.com";

		var memberB = await CreateTenantMemberAsync(tenantId, email: emailB);
		var memberA = await CreateTenantMemberAsync(tenantId, email: emailA);

		await AssignAsync(token, tenantId, profileId, memberB);
		await AssignAsync(token, tenantId, profileId, memberA);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), profileId.ToString())
				+ "?limit=50&sort_id=email&sort_order=asc"
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindTenantProfileUsersAsStaffResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Users.Select(u => u.Email).Should().BeInAscendingOrder();
	}

	[Fact]
	public async Task ItShouldAcceptAllSupportedSortIds() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);
		var memberId = await CreateTenantMemberAsync(tenantId);
		await AssignAsync(token, tenantId, profileId, memberId);

		var sortIds = new[] { "created_at", "email", "first_name", "last_name", "status" };
		foreach (var sortId in sortIds) {
			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				GetUrl(tenantId.ToString(), profileId.ToString())
					+ $"?limit=50&sort_id={sortId}&sort_order=desc"
			).WithSessionToken(token);

			using var response = await _http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.OK);
		}
	}

	/// <summary>
	/// Suspension is not removal: staff must still see a suspended member's assignments, mirroring
	/// the staff-profiles Find precedent's explicit choice not to hide suspended rows.
	/// </summary>
	[Fact]
	public async Task ItShouldIncludeSuspendedMembers() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(tenantId);
		var memberId = await CreateTenantMemberAsync(tenantId);

		await AssignAsync(token, tenantId, profileId, memberId);
		await SetMemberAccountStatusAsync(memberId, AccountStatus.Suspended);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), profileId.ToString()) + "?limit=50"
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindTenantProfileUsersAsStaffResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		var member = result.Users.Should().ContainSingle(u => u.Id == memberId).Subject;
		member.Status.Should().Be("Suspended");
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
			description: "Profile created for FindTenantProfileUsersAsStaffSpec"
		);
		profile.ValidateProfileType();

		_ = dbContext.Profile.Add(profile);
		_ = await dbContext.SaveChangesAsync();

		return profile.GetRequiredId();
	}

	private async Task<Guid> CreateTenantMemberAsync(
		Guid tenantId,
		string? email = null
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
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

	// -- Response DTOs --

	private record FindTenantProfileUsersAsStaffResponse {
		public List<TenantProfileUserItemResponse> Users { get; init; } = [];
		public int Count { get; init; }
	}

	private record TenantProfileUserItemResponse {
		public Guid Id { get; init; }
		public string Email { get; init; } = string.Empty;
		public string? LastName { get; init; }
		public string? FirstName { get; init; }
		public string? AvatarUrl { get; init; }
		public string Status { get; init; } = string.Empty;
		public string Level { get; init; } = string.Empty;
	}
}
