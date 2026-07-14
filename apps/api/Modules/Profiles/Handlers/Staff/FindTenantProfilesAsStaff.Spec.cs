
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Tenants.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public sealed class FindTenantProfilesAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindTenantProfilesAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl(string tenantId, string query = "") {
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Profiles.ForTenantAsStaff.Find
		);

		return query.Length == 0 ? url : $"{url}?{query}";
	}

	[Fact]
	public async Task ItShouldReturnZeroPermissionsCountForProfileWithNoPermissions() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var profileId = await SeedTenantProfileAsync(tenantId, permissionCount: 0);

		var profile = await FindProfileAsync(token, tenantId, profileId);

		profile.PermissionsCount.Should().Be(0);
	}

	[Fact]
	public async Task ItShouldReturnOnePermissionsCountForProfileWithOnePermission() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var profileId = await SeedTenantProfileAsync(tenantId, permissionCount: 1);

		var profile = await FindProfileAsync(token, tenantId, profileId);

		profile.PermissionsCount.Should().Be(1);
	}

	[Fact]
	public async Task ItShouldReturnManyPermissionsCountForProfileWithManyPermissions() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var profileId = await SeedTenantProfileAsync(tenantId, permissionCount: 3);

		var profile = await FindProfileAsync(token, tenantId, profileId);

		profile.PermissionsCount.Should().Be(3);
	}

	[Fact]
	public async Task ItShouldComputePermissionsCountsForMultipleProfilesInOneBatch() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var firstProfileId = await SeedTenantProfileAsync(tenantId, permissionCount: 2);
		var secondProfileId = await SeedTenantProfileAsync(tenantId, permissionCount: 0);

		var firstProfile = await FindProfileAsync(token, tenantId, firstProfileId);
		var secondProfile = await FindProfileAsync(token, tenantId, secondProfileId);

		firstProfile.PermissionsCount.Should().Be(2);
		secondProfile.PermissionsCount.Should().Be(0);
	}

	[Fact]
	public async Task ItShouldReturnOnlyDefaultProfilesWhenIsDefaultTrue() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		// A dedicated tenant avoids racing the "one active default profile per
		// tenant" unique constraint against other tests seeding Acme in parallel.
		var tenantId = await SeedFreshTenantAsync("Profiles IsDefault True");
		var defaultProfileId = await SeedTenantProfileAsync(
			tenantId, permissionCount: 0, isDefault: true
		);
		var customProfileId = await SeedTenantProfileAsync(
			tenantId, permissionCount: 0, isDefault: false
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), "limit=100&is_default=true")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindTenantProfilesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Data.Should().Contain(p => p.Id == defaultProfileId);
		result.Data.Should().NotContain(p => p.Id == customProfileId);
		result.Data.Should().OnlyContain(p => p.IsDefault);
	}

	[Fact]
	public async Task ItShouldReturnOnlyCustomProfilesWhenIsDefaultFalse() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await SeedFreshTenantAsync("Profiles IsDefault False");
		var defaultProfileId = await SeedTenantProfileAsync(
			tenantId, permissionCount: 0, isDefault: true
		);
		var customProfileId = await SeedTenantProfileAsync(
			tenantId, permissionCount: 0, isDefault: false
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), "limit=100&is_default=false")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindTenantProfilesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Data.Should().Contain(p => p.Id == customProfileId);
		result.Data.Should().NotContain(p => p.Id == defaultProfileId);
		result.Data.Should().OnlyContain(p => !p.IsDefault);
	}

	[Fact]
	public async Task ItShouldReturnBothProfileTypesWhenIsDefaultIsAbsent() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await SeedFreshTenantAsync("Profiles IsDefault Absent");
		var defaultProfileId = await SeedTenantProfileAsync(
			tenantId, permissionCount: 0, isDefault: true
		);
		var customProfileId = await SeedTenantProfileAsync(
			tenantId, permissionCount: 0, isDefault: false
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), "limit=100")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindTenantProfilesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Data.Should().Contain(p => p.Id == defaultProfileId);
		result.Data.Should().Contain(p => p.Id == customProfileId);
	}

	[Fact]
	public async Task ItShouldTreatABarePercentSearchAsALiteralCharacterNotAWildcard() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await SeedFreshTenantAsync("Profiles Percent Search");
		var marker = Guid.NewGuid().ToString("N")[..8];
		var withPercentId = await SeedTenantProfileWithNameAsync(tenantId, $"Has%Percent{marker}");
		var withoutPercentId = await SeedTenantProfileWithNameAsync(tenantId, $"NoPercentAtAll{marker}");

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), $"limit=100&q={Uri.EscapeDataString("%")}")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindTenantProfilesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		// If '%' were interpolated unescaped into the ILIKE pattern, "%%%"
		// collapses to a bare wildcard matching every row. Escaped, only the
		// profile whose name literally contains '%' may match.
		result.Data.Should().Contain(p => p.Id == withPercentId);
		result.Data.Should().NotContain(p => p.Id == withoutPercentId);
	}

	[Fact]
	public async Task ItShouldReturnUnprocessableEntityForInvalidIsDefaultValue() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), "is_default=not-a-bool")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	private async Task<Guid> GetTenantIdAsync() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			token,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<Guid> SeedFreshTenantAsync(string namePrefix) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"{namePrefix} {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();

		return tenant.GetRequiredId();
	}

	private async Task<Guid> SeedTenantProfileWithNameAsync(Guid tenantId, string name) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var profile = Profile.CreateTenantProfile(tenantId, name, isDefault: false);
		await dbContext.Profile.AddAsync(profile);
		await dbContext.SaveChangesAsync();

		return profile.GetRequiredId();
	}

	private async Task<Guid> SeedTenantProfileAsync(
		Guid tenantId,
		int permissionCount,
		bool isDefault = false
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var profile = Profile.CreateTenantProfile(
			tenantId,
			"Permission Count Profile " + Guid.NewGuid().ToString("N")[..8],
			isDefault: isDefault
		);

		await dbContext.Profile.AddAsync(profile);
		await dbContext.SaveChangesAsync();

		var profileId = profile.GetRequiredId();
		var availablePermissionKeys = new[] {
			AppPermissions.Tenant.Modules.ACCESS_USERS.Key,
			AppPermissions.Tenant.Modules.ACCESS_SETTINGS.Key,
			AppPermissions.Tenant.Modules.ACCESS_BILLING.Key,
		};

		for (var i = 0; i < permissionCount; i++) {
			await dbContext.ProfilePermission.AddAsync(new ProfilePermission {
				ProfileId = profileId,
				PermissionKey = availablePermissionKeys[i % availablePermissionKeys.Length],
			});
		}
		await dbContext.SaveChangesAsync();

		return profileId;
	}

	private async Task<TenantProfileItemResponse> FindProfileAsync(
		string token,
		Guid tenantId,
		Guid profileId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), "limit=100")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindTenantProfilesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		var profile = result.Data.FirstOrDefault(p => p.Id == profileId);
		profile.Should().NotBeNull(
			$"profile {profileId} should be present in the tenant profiles list"
		);
		Assert.NotNull(profile);

		return profile;
	}

	private sealed record FindTenantProfilesResponse {
		public List<TenantProfileItemResponse> Data { get; init; } = [];
		public string? NextCursor { get; init; }
	}

	private sealed record TenantProfileItemResponse {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
		public string? Description { get; init; }
		public bool IsDefault { get; init; }
		public int UserAccountCount { get; init; }
		public int PermissionsCount { get; init; }
	}
}
