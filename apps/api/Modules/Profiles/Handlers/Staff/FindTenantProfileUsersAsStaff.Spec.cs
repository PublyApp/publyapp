
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
	public async Task ItShouldReturnForbiddenForNonStaffUser() {
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
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
	public async Task ItShouldReturnNotFoundForMissingProfile() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundWhenProfileBelongsToADifferentTenant() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var acmeTenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var otherTenantId = await GetTenantIdAsync(SeedConstants.Tenants.TechStartName);

		// Profile lives under Acme; requesting it under TechStart must 404, never
		// leak members across tenants.
		var profileId = await CreateTenantProfileAsync(token, acmeTenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(otherTenantId.ToString(), profileId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForInvalidSortId() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(token, tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), profileId.ToString()) + "?sort_id=not_real"
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestWhenCursorRecordNotFound() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(token, tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), profileId.ToString())
				+ $"?cursor={Guid.NewGuid()}"
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldReturnMembersWithTheirOtherProfiles() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);

		var profileA = await CreateTenantProfileAsync(token, tenantId);
		var profileBName = "Other Profile " + Guid.NewGuid().ToString("N")[..8];
		var profileB = await CreateTenantProfileAsync(token, tenantId, profileBName);

		var adminAccountId =
			await GetTenantAccountIdAsync(tenantId, SeedConstants.Tenants.AcmeAdminEmail);
		var userAccountId =
			await GetTenantAccountIdAsync(tenantId, SeedConstants.Tenants.AcmeUserEmail);

		// The regular user holds BOTH A and B; the admin holds only A. So on A's
		// member list, the user must surface B under otherProfiles and the admin
		// must not surface A.
		await AssignTenantProfilesAsync([
			(adminAccountId, profileA),
			(userAccountId, profileA),
			(userAccountId, profileB),
		]);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), profileA.ToString()) + "?limit=50"
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<MemberResponse>();
		Assert.NotNull(result);

		result.Data.Should().Contain(m =>
			string.Equals(
				m.Email,
				SeedConstants.Tenants.AcmeAdminEmail,
				StringComparison.OrdinalIgnoreCase
			)
		);

		var userMember = result.Data.Single(m =>
			string.Equals(
				m.Email,
				SeedConstants.Tenants.AcmeUserEmail,
				StringComparison.OrdinalIgnoreCase
			)
		);
		userMember.UserAccountId.Should().Be(userAccountId);
		userMember.OtherProfiles.Should().Contain(p =>
			p.Id == profileB && p.Name == profileBName
		);
		// The profile being viewed must never appear in otherProfiles.
		userMember.OtherProfiles.Should().NotContain(p => p.Id == profileA);
	}

	[Fact]
	public async Task ItShouldPaginateWithCursor() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(token, tenantId);

		var adminAccountId =
			await GetTenantAccountIdAsync(tenantId, SeedConstants.Tenants.AcmeAdminEmail);
		var userAccountId =
			await GetTenantAccountIdAsync(tenantId, SeedConstants.Tenants.AcmeUserEmail);

		await AssignTenantProfilesAsync([
			(adminAccountId, profileId),
			(userAccountId, profileId),
		]);

		using var firstRequest = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), profileId.ToString()) + "?limit=1"
		).WithSessionToken(token);

		using var firstResponse = await _http.SendAsync(firstRequest);
		firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var firstPage = await firstResponse.Content.ReadFromJsonAsync<MemberResponse>();
		Assert.NotNull(firstPage);
		firstPage.Data.Should().HaveCount(1);
		firstPage.NextCursor.Should().NotBeNullOrEmpty();

		using var secondRequest = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), profileId.ToString())
				+ $"?limit=1&cursor={firstPage.NextCursor}"
		).WithSessionToken(token);

		using var secondResponse = await _http.SendAsync(secondRequest);
		secondResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var secondPage = await secondResponse.Content.ReadFromJsonAsync<MemberResponse>();
		Assert.NotNull(secondPage);
		secondPage.Data.Should().HaveCount(1);
		// The two pages must return distinct members (no overlap across the cursor).
		secondPage.Data[0].UserAccountId.Should().NotBe(firstPage.Data[0].UserAccountId);
	}

	[Fact]
	public async Task ItShouldReturnEmptyDataForAProfileWithNoMembers() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(token, tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), profileId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<MemberResponse>();
		Assert.NotNull(result);
		result.Data.Should().BeEmpty();
		result.NextCursor.Should().BeNull();
	}

	// -- Helpers --

	private async Task<Guid> GetTenantIdAsync(string tenantName) {
		var token = await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(_http, token, tenantName);
	}

	private async Task<Guid> CreateTenantProfileAsync(
		string staffToken,
		Guid tenantId,
		string? name = null
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Profiles.ForTenantAsStaff.RootFn(tenantId.ToString()),
				Routes.Profiles.ForTenantAsStaff.Create
			)
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				name = name ?? ("Members Profile " + Guid.NewGuid().ToString("N")[..8]),
				description = "Profile created for FindTenantProfileUsersAsStaffSpec",
			}
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var created = await response.Content.ReadFromJsonAsync<CreatedProfileResponse>();
		Assert.NotNull(created);
		return created.Profile.Id;
	}

	private async Task<Guid> GetTenantAccountIdAsync(Guid tenantId, string email) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var account = await dbContext.UserAccount.FirstAsync(ua =>
			ua.TenantId == tenantId
			&& ua.Scope == AccountScope.Tenant
			&& ua.User.Email == email
		);

		return account.GetRequiredId();
	}

	private async Task AssignTenantProfilesAsync(
		IEnumerable<(Guid UserAccountId, Guid ProfileId)> assignments
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		foreach (var (userAccountId, profileId) in assignments) {
			await dbContext.UserAccountProfile.AddAsync(new UserAccountProfile {
				UserAccountId = userAccountId,
				ProfileId = profileId,
			});
		}

		await dbContext.SaveChangesAsync();
	}

	// -- Response DTOs --

	private sealed record CreatedProfileResponse {
		public required CreatedProfile Profile { get; init; }
	}

	private sealed record CreatedProfile {
		public Guid Id { get; init; }
	}

	private sealed record MemberResponse {
		public List<MemberItem> Data { get; init; } = [];
		public string? NextCursor { get; init; }
	}

	private sealed record MemberItem {
		public Guid UserAccountId { get; init; }
		public Guid UserId { get; init; }
		public string Name { get; init; } = string.Empty;
		public string Email { get; init; } = string.Empty;
		public string Level { get; init; } = string.Empty;
		public string Status { get; init; } = string.Empty;
		public DateTime JoinedAt { get; init; }
		public List<MemberOtherProfile> OtherProfiles { get; init; } = [];
	}

	private sealed record MemberOtherProfile {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
	}
}
