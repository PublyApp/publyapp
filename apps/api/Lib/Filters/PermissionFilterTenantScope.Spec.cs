using FluentAssertions;

using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Permissions.Entities;
using PublyApp.Api.Modules.Permissions.Services;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Lib.Filters;

// A staff route under /staff/tenants/{tenantId}/... gets a context scoped to the route
// tenant, but only once the staff permission check has passed. The probe `next` reads
// posts with NO tenant predicate, so what it sees is the global filter at work.
public sealed class PermissionFilterTenantScopeSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;

	public PermissionFilterTenantScopeSpec(ApiFixture fixture) {
		this._Fixture = fixture;
	}

	private sealed class FixedPermissions(HashSet<string> granted) : IPermissionService {
		public Task<HashSet<string>> GetPermissionsAsync(Guid userId) {
			return Task.FromResult(granted);
		}

		public Task<HashSet<string>> GetEffectivePermissionsAsync(Guid userId, Guid? tenantId = null, Guid? projectId = null) {
			throw new NotSupportedException();
		}

		public Task<HashSet<string>> GetTenantPermissionsAsync(Guid userId, Guid tenantId) {
			throw new NotSupportedException();
		}

		public Task<HashSet<string>> GetPermissionsForRolesAsync(List<Guid> roleIds) {
			throw new NotSupportedException();
		}
	}

	private async Task<(AppDbContext Db, Func<Task<List<Guid>>> Probe, ServiceProvider Provider, DefaultHttpContext Http)>
	_BuildAsync(HashSet<string> granted, string? routeTenantId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();
		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was null.");
		}

		var services = new ServiceCollection();
		services.AddLogging();
		services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connectionString));
		services.AddScoped<IRequestAuthContext, RequestAuthContext>();
		services.AddSingleton<IPermissionService>(new FixedPermissions(granted));
		var provider = services.BuildServiceProvider();

		var http = new DefaultHttpContext { RequestServices = provider.CreateScope().ServiceProvider };
		if (routeTenantId is not null) {
			http.Request.RouteValues["tenantId"] = routeTenantId;
		}
		var auth = http.RequestServices.GetRequiredService<IRequestAuthContext>();
		auth.AccountStaff = UserAccount.CreateStaffAccount(Guid.NewGuid());

		var db = http.RequestServices.GetRequiredService<AppDbContext>();
		return (db, async () => (await db.Post.Select(p => p.Id).ToListAsync()).OfType<Guid>().ToList(), provider, http);
	}

	private static async Task<List<Guid>?> _RunFilterAsync(
		PermissionFilter filter,
		DefaultHttpContext http,
		Func<Task<List<Guid>>> probe
	) {
		List<Guid>? seen = null;
		var result = await filter.InvokeAsync(
			EndpointFilterInvocationContext.Create(http),
			async _ => {
				seen = await probe();
				return null;
			}
		);
		return result is null ? seen : null;
	}

	private static PermissionFilter _Filter(Permission permission) {
		return new PermissionFilter([permission]);
	}

	[Fact]
	public async Task ItShouldShowOnlyTheRouteTenantsDataToTheHandlerOnceStaffIsAuthorized() {
		var permission = AppPermissions.Staff.Tenants.GET;
		await using var seedScope = this._Fixture.Factory.Services.CreateAsyncScope();
		var seedDb = seedScope.ServiceProvider.GetRequiredService<AppDbContext>();
		var (tenantA, postA) = await AppDbContextTenantFilterSpec.SeedAsync(seedDb);
		var (_, postB) = await AppDbContextTenantFilterSpec.SeedAsync(seedDb);

		var (_, probe, provider, http) = await this._BuildAsync([permission.Key], tenantA.ToString());
		await using var _ = provider;

		var seen = await PermissionFilterTenantScopeSpec._RunFilterAsync(
			PermissionFilterTenantScopeSpec._Filter(permission), http, probe
		);

		seen.Should().NotBeNull();
		seen.Should().Contain(postA).And.NotContain(postB);
	}

	[Fact]
	public async Task ItShouldNotScopeTheContextWhenThePermissionCheckFails() {
		var permission = AppPermissions.Staff.Tenants.GET;
		await using var seedScope = this._Fixture.Factory.Services.CreateAsyncScope();
		var (tenantA, _) = await AppDbContextTenantFilterSpec.SeedAsync(
			seedScope.ServiceProvider.GetRequiredService<AppDbContext>()
		);

		var (db, probe, provider, http) = await this._BuildAsync(["some.other.permission"], tenantA.ToString());
		await using var _ = provider;

		var seen = await PermissionFilterTenantScopeSpec._RunFilterAsync(
			PermissionFilterTenantScopeSpec._Filter(permission), http, probe
		);

		seen.Should().BeNull("the handler must not run for a denied caller");
		db.TenantId.Should().BeNull("a route value is never trusted before authorization");
	}

	[Theory]
	[InlineData(null)]
	[InlineData("not-a-guid")]
	public async Task ItShouldLeaveTheContextUnscopedWithoutAValidRouteTenant(string? routeTenantId) {
		var permission = AppPermissions.Staff.Tenants.LIST;
		var (db, probe, provider, http) = await this._BuildAsync([permission.Key], routeTenantId);
		await using var _ = provider;

		var seen = await PermissionFilterTenantScopeSpec._RunFilterAsync(
			PermissionFilterTenantScopeSpec._Filter(permission), http, probe
		);

		seen.Should().NotBeNull();
		db.TenantId.Should().BeNull();
	}
}
