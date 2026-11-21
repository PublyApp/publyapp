using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Projects.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Tenants.Handlers.Staff;

using Xunit;

namespace PublyApp.Api.Lib.Filters;

// End to end through the real pipeline: a real /staff/tenants/{A}/usage route called with
// a stale X-Tenant-Id of tenant B still answers with A's data only, and a context never
// silently switches from one tenant to another.
public sealed class StaffRouteTenantScopeSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly TestAuthClient _AuthClient;

	public StaffRouteTenantScopeSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._AuthClient = new TestAuthClient(fixture.HttpClient);
	}

	private async Task<Guid> _SeedTenantWithProjectsAsync(int projects) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var tenant = new Tenant {
			Name = $"staff-scope {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 5,
		};
		db.Tenant.Add(tenant);
		await db.SaveChangesAsync();
		for (var i = 0; i < projects; i++) {
			db.Project.Add(new Project {
				TenantId = tenant.GetRequiredId(),
				Name = $"staff-scope-project-{Guid.NewGuid():N}",
			});
		}
		await db.SaveChangesAsync();

		return tenant.GetRequiredId();
	}

	[Fact]
	public async Task ItShouldAnswerWithTheRouteTenantsDataWhenTheHeaderNamesAnotherTenant() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantA = await this._SeedTenantWithProjectsAsync(projects: 1);
		var tenantB = await this._SeedTenantWithProjectsAsync(projects: 3);

		var url = PathUtils.Join(
			Routes.Routes.Staff.Root,
			Routes.Routes.Tenants.ForStaff.Root,
			Routes.Routes.Tenants.ForStaff.UsageFn(tenantA.ToString())
		);
		var request = new HttpRequestMessage(HttpMethod.Get, url).WithSessionToken(staffToken);
		request.Headers.Add(AppEnvironment.Instance.TENANT_ID_HEADER_KEY, tenantB.ToString());

		using var response = await this._Fixture.HttpClient.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await response.Content.ReadFromJsonAsync<GetTenantUsageAsStaffResult>();
		if (result is null) {
			throw new InvalidOperationException("GET tenant usage response was empty.");
		}
		result.TenantId.Should().Be(tenantA);
		result.ProjectsCount.Should().Be(1);
	}

	[Fact]
	public void ItShouldThrowWhenAContextAlreadyScopedToATenantIsScopedToAnother() {
		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql("Host=localhost")
			.Options;
		using var db = new AppDbContext(options);
		var tenantA = Guid.NewGuid();

		db.ScopeToTenant(tenantA);
		db.ScopeToTenant(tenantA);
		var switching = () => db.ScopeToTenant(Guid.NewGuid());

		switching.Should().Throw<InvalidOperationException>();
		db.TenantId.Should().Be(tenantA);
	}
}
