
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
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Tenants.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class FindTenantRolesAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public FindTenantRolesAsStaffSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _GetUrl(string tenantId, string query = "") {
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Roles.ForTenantAsStaff.Find
		);

		return query.Length == 0 ? url : $"{url}?{query}";
	}

	[Fact]
	public async Task ItShouldReturnZeroPermissionsCountForRoleWithNoPermissions() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var roleId = await this._SeedTenantRoleAsync(tenantId, permissionCount: 0);

		var role = await this._FindRoleAsync(token, tenantId, roleId);

		role.PermissionsCount.Should().Be(0);
	}

	[Fact]
	public async Task ItShouldReturnOnePermissionsCountForRoleWithOnePermission() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var roleId = await this._SeedTenantRoleAsync(tenantId, permissionCount: 1);

		var role = await this._FindRoleAsync(token, tenantId, roleId);

		role.PermissionsCount.Should().Be(1);
	}

	[Fact]
	public async Task ItShouldReturnManyPermissionsCountForRoleWithManyPermissions() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var roleId = await this._SeedTenantRoleAsync(tenantId, permissionCount: 3);

		var role = await this._FindRoleAsync(token, tenantId, roleId);

		role.PermissionsCount.Should().Be(3);
	}

	[Fact]
	public async Task ItShouldComputePermissionsCountsForMultipleRolesInOneBatch() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var firstRoleId = await this._SeedTenantRoleAsync(tenantId, permissionCount: 2);
		var secondRoleId = await this._SeedTenantRoleAsync(tenantId, permissionCount: 0);

		var firstRole = await this._FindRoleAsync(token, tenantId, firstRoleId);
		var secondRole = await this._FindRoleAsync(token, tenantId, secondRoleId);

		firstRole.PermissionsCount.Should().Be(2);
		secondRole.PermissionsCount.Should().Be(0);
	}

	[Fact]
	public async Task ItShouldReturnOnlyFullAccessRolesWhenIsFullAccessTrue() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		// A dedicated tenant avoids racing the "one active full-access role per
		// tenant" unique constraint against other tests seeding Acme in parallel.
		var tenantId = await this._SeedFreshTenantAsync("Roles IsFullAccess True");
		var fullAccessRoleId = await this._SeedTenantRoleAsync(
			tenantId, permissionCount: 0, isFullAccess: true
		);
		var customRoleId = await this._SeedTenantRoleAsync(
			tenantId, permissionCount: 0, isFullAccess: false
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantRolesAsStaffSpec._GetUrl(tenantId.ToString(), "limit=100&is_full_access=true")
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindTenantRolesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Data.Should().Contain(p => p.Id == fullAccessRoleId);
		result.Data.Should().NotContain(p => p.Id == customRoleId);
		result.Data.Should().OnlyContain(p => p.IsFullAccess);
	}

	[Fact]
	public async Task ItShouldReturnOnlyCustomRolesWhenIsFullAccessFalse() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._SeedFreshTenantAsync("Roles IsFullAccess False");
		var fullAccessRoleId = await this._SeedTenantRoleAsync(
			tenantId, permissionCount: 0, isFullAccess: true
		);
		var customRoleId = await this._SeedTenantRoleAsync(
			tenantId, permissionCount: 0, isFullAccess: false
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantRolesAsStaffSpec._GetUrl(tenantId.ToString(), "limit=100&is_full_access=false")
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindTenantRolesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Data.Should().Contain(p => p.Id == customRoleId);
		result.Data.Should().NotContain(p => p.Id == fullAccessRoleId);
		result.Data.Should().OnlyContain(p => !p.IsFullAccess);
	}

	[Fact]
	public async Task ItShouldReturnBothRoleTypesWhenIsFullAccessIsAbsent() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._SeedFreshTenantAsync("Roles IsFullAccess Absent");
		var fullAccessRoleId = await this._SeedTenantRoleAsync(
			tenantId, permissionCount: 0, isFullAccess: true
		);
		var customRoleId = await this._SeedTenantRoleAsync(
			tenantId, permissionCount: 0, isFullAccess: false
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantRolesAsStaffSpec._GetUrl(tenantId.ToString(), "limit=100")
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindTenantRolesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Data.Should().Contain(p => p.Id == fullAccessRoleId);
		result.Data.Should().Contain(p => p.Id == customRoleId);
	}

	[Fact]
	public async Task ItShouldReturnBothRoleTypesWhenIsFullAccessIsWhitespace() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._SeedFreshTenantAsync("Roles IsFullAccess Whitespace");
		var fullAccessRoleId = await this._SeedTenantRoleAsync(
			tenantId, permissionCount: 0, isFullAccess: true
		);
		var customRoleId = await this._SeedTenantRoleAsync(
			tenantId, permissionCount: 0, isFullAccess: false
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantRolesAsStaffSpec._GetUrl(
				tenantId.ToString(),
				$"limit=100&is_full_access={Uri.EscapeDataString(" ")}"
			)
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindTenantRolesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Data.Should().Contain(p => p.Id == fullAccessRoleId);
		result.Data.Should().Contain(p => p.Id == customRoleId);
	}

	[Fact]
	public async Task ItShouldTreatABarePercentSearchAsALiteralCharacterNotAWildcard() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._SeedFreshTenantAsync("Roles Percent Search");
		var marker = Guid.NewGuid().ToString("N")[..8];
		var withPercentId = await this._SeedTenantRoleWithNameAsync(tenantId, $"Has%Percent{marker}");
		var withoutPercentId = await this._SeedTenantRoleWithNameAsync(tenantId, $"NoPercentAtAll{marker}");

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantRolesAsStaffSpec._GetUrl(tenantId.ToString(), $"limit=100&q={Uri.EscapeDataString("%")}")
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindTenantRolesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		// If '%' were interpolated unescaped into the ILIKE pattern, "%%%"
		// collapses to a bare wildcard matching every row. Escaped, only the
		// role whose name literally contains '%' may match.
		result.Data.Should().Contain(p => p.Id == withPercentId);
		result.Data.Should().NotContain(p => p.Id == withoutPercentId);
	}

	[Fact]
	public async Task ItShouldReturnUnprocessableEntityForInvalidIsFullAccessValue() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantRolesAsStaffSpec._GetUrl(tenantId.ToString(), "is_full_access=not-a-bool")
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	private async Task<Guid> _GetTenantIdAsync() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http,
			token,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<Guid> _SeedFreshTenantAsync(string namePrefix) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
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

	private async Task<Guid> _SeedTenantRoleWithNameAsync(Guid tenantId, string name) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var role = Role.CreateTenantRole(tenantId, name, isDefault: false);
		await dbContext.Role.AddAsync(role);
		await dbContext.SaveChangesAsync();

		return role.GetRequiredId();
	}

	private async Task<Guid> _SeedTenantRoleAsync(
		Guid tenantId,
		int permissionCount,
		bool isDefault = false,
		bool isFullAccess = false
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var role = Role.CreateTenantRole(
			tenantId,
			"Permission Count Role " + Guid.NewGuid().ToString("N")[..8],
			isDefault: isDefault,
			isFullAccess: isFullAccess
		);

		await dbContext.Role.AddAsync(role);
		await dbContext.SaveChangesAsync();

		var roleId = role.GetRequiredId();
		var availablePermissionKeys = new[] {
			AppPermissions.Tenant.Modules.ACCESS_USERS.Key,
			AppPermissions.Tenant.Modules.ACCESS_SETTINGS.Key,
			AppPermissions.Tenant.Modules.ACCESS_BILLING.Key,
		};

		for (var i = 0; i < permissionCount; i++) {
			await dbContext.RolePermission.AddAsync(new RolePermission {
				RoleId = roleId,
				PermissionKey = availablePermissionKeys[i % availablePermissionKeys.Length],
			});
		}
		await dbContext.SaveChangesAsync();

		return roleId;
	}

	private async Task<TenantRoleItemResponse> _FindRoleAsync(
		string token,
		Guid tenantId,
		Guid roleId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantRolesAsStaffSpec._GetUrl(tenantId.ToString(), "limit=100")
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindTenantRolesResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		var role = result.Data.FirstOrDefault(p => p.Id == roleId);
		role.Should().NotBeNull(
			$"role {roleId} should be present in the tenant roles list"
		);
		Assert.NotNull(role);

		return role;
	}

	private sealed record FindTenantRolesResponse {
		public List<TenantRoleItemResponse> Data { get; init; } = [];
		public string? NextCursor { get; init; }
	}

	private sealed record TenantRoleItemResponse {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
		public string? Description { get; init; }
		public bool IsDefault { get; init; }
		public bool IsFullAccess { get; init; }
		public int UserAccountCount { get; init; }
		public int PermissionsCount { get; init; }
	}
}
