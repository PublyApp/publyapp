using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Roles.Services;
using PublyApp.Api.Modules.Tenants.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

/// <summary>
/// #2327: the role list and detail DTOs must tell the front which role is the
/// protected full-access system role, on both the staff and tenant scopes.
/// </summary>
public sealed class RoleFullAccessFlagSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public RoleFullAccessFlagSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	[Fact]
	public async Task ItShouldExposeIsFullAccessOnTheStaffRoleListAndDetail() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var marker = Guid.NewGuid().ToString("N")[..8];
		var systemRoleId = await this._SeedStaffRoleAsync(
			$"System {marker}",
			isFullAccess: true
		);
		var customRoleId = await this._SeedStaffRoleAsync(
			$"Custom {marker}",
			isFullAccess: false
		);

		var list = await this._GetAsync<FindStaffRolesResponse>(
			token,
			RoleFullAccessFlagSpec._StaffListUrl($"limit=100&q={marker}")
		);
		list.Data.Single(p => p.Id == systemRoleId).IsFullAccess.Should().BeTrue();
		list.Data.Single(p => p.Id == customRoleId).IsFullAccess.Should().BeFalse();

		var systemDetail = await this._GetAsync<GetStaffRoleByIdResult>(
			token,
			RoleFullAccessFlagSpec._StaffDetailUrl(systemRoleId)
		);
		systemDetail.Role.IsFullAccess.Should().BeTrue();

		var customDetail = await this._GetAsync<GetStaffRoleByIdResult>(
			token,
			RoleFullAccessFlagSpec._StaffDetailUrl(customRoleId)
		);
		customDetail.Role.IsFullAccess.Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldExposeIsFullAccessOnTheTenantRoleListAndDetail() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._SeedFreshTenantAsync();
		var systemRoleId = await this._SeedTenantRoleAsync(
			tenantId,
			isFullAccess: true
		);
		var customRoleId = await this._SeedTenantRoleAsync(
			tenantId,
			isFullAccess: false
		);

		var list = await this._GetAsync<FindTenantRolesAsStaffResult>(
			token,
			RoleFullAccessFlagSpec._TenantListUrl(tenantId)
		);
		list.Data.Single(p => p.Id == systemRoleId).IsFullAccess.Should().BeTrue();
		list.Data.Single(p => p.Id == customRoleId).IsFullAccess.Should().BeFalse();

		var systemDetail = await this._GetAsync<GetTenantRoleByIdResponse>(
			token,
			RoleFullAccessFlagSpec._TenantDetailUrl(tenantId, systemRoleId)
		);
		systemDetail.Role.IsFullAccess.Should().BeTrue();

		var customDetail = await this._GetAsync<GetTenantRoleByIdResponse>(
			token,
			RoleFullAccessFlagSpec._TenantDetailUrl(tenantId, customRoleId)
		);
		customDetail.Role.IsFullAccess.Should().BeFalse();
	}

	private static string _StaffListUrl(string query) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForStaff.Root,
			Routes.Roles.ForStaff.Find
		) + $"?{query}";
	}

	private static string _StaffDetailUrl(Guid roleId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForStaff.Root,
			Routes.Roles.ForStaff.GetFn(roleId.ToString())
		);
	}

	private static string _TenantListUrl(Guid tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForTenantAsStaff.RootFn(tenantId.ToString()),
			Routes.Roles.ForTenantAsStaff.Find
		) + "?limit=100";
	}

	private static string _TenantDetailUrl(Guid tenantId, Guid roleId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForTenantAsStaff.RootFn(tenantId.ToString()),
			Routes.Roles.ForTenantAsStaff.GetFn(roleId.ToString())
		);
	}

	private async Task<T> _GetAsync<T>(string token, string url) {
		using var request = new HttpRequestMessage(HttpMethod.Get, url)
			.WithSessionToken(token);
		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<T>();
		if (payload is null) {
			throw new InvalidOperationException($"Empty JSON body for {url}");
		}
		return payload;
	}

	private async Task<Guid> _SeedStaffRoleAsync(
		string name,
		bool isFullAccess
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var role = Role.CreateStaffRole(name, isFullAccess: isFullAccess);
		await dbContext.Role.AddAsync(role);
		await dbContext.SaveChangesAsync();

		return role.GetRequiredId();
	}

	private async Task<Guid> _SeedFreshTenantAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"Role flag {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();

		return tenant.GetRequiredId();
	}

	private async Task<Guid> _SeedTenantRoleAsync(
		Guid tenantId,
		bool isFullAccess
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var role = Role.CreateTenantRole(
			tenantId,
			"Role " + Guid.NewGuid().ToString("N")[..8],
			isFullAccess: isFullAccess
		);
		await dbContext.Role.AddAsync(role);
		await dbContext.SaveChangesAsync();

		return role.GetRequiredId();
	}

	private sealed record FindStaffRolesResponse {
		public List<StaffRoleItem> Data { get; init; } = [];
	}
}
