using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Tests.Data.DbContext;

// EF builds the model once per process, so the tenant query filter must read
// the context's tenant per query instead of capturing it at model build time.
// Every query below carries NO explicit tenant predicate.
public sealed class AppDbContextTenantFilterSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;

	public AppDbContextTenantFilterSpec(ApiFixture fixture) {
		this._Fixture = fixture;
	}

	private async Task<AppDbContext> _NewDbAsync(Guid? tenantId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();
		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was null.");
		}

		var builder = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connectionString);
		if (tenantId.HasValue) {
			builder.UseTenantId(tenantId.Value);
		}

		return new AppDbContext(builder.Options);
	}

	private static async Task<(Guid TenantId, Guid PostId)> _SeedAsync(AppDbContext db) {
		var tenant = new Tenant {
			Name = $"tenant-filter-{Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		var user = new User {
			Email = $"tenant-filter-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true,
		};
		db.Tenant.Add(tenant);
		db.User.Add(user);
		await db.SaveChangesAsync();

		var post = new Post {
			TenantId = tenant.GetRequiredId(),
			Body = "tenant filter spec body",
			CreatedByUserId = user.GetRequiredId(),
		};
		db.Post.Add(post);
		await db.SaveChangesAsync();

		return (tenant.GetRequiredId(), post.GetRequiredId());
	}

	[Fact]
	public async Task ItShouldFilterByEachContextsOwnTenantWithinOneProcess() {
		// No-tenant context first: it must not decide the filter for later contexts.
		await using var seedDb = await this._NewDbAsync(null);
		var (tenantA, postA) = await AppDbContextTenantFilterSpec._SeedAsync(seedDb);
		var (tenantB, postB) = await AppDbContextTenantFilterSpec._SeedAsync(seedDb);

		await using var dbA = await this._NewDbAsync(tenantA);
		await using var dbB = await this._NewDbAsync(tenantB);

		var seenByA = await dbA.Post.Select(p => p.Id).ToListAsync();
		var seenByB = await dbB.Post.Select(p => p.Id).ToListAsync();

		seenByA.Should().Contain(postA).And.NotContain(postB);
		seenByB.Should().Contain(postB).And.NotContain(postA);
	}

	[Fact]
	public async Task ItShouldNotFilterWhenTheContextHasNoTenant() {
		await using var seedDb = await this._NewDbAsync(null);
		var (_, postA) = await AppDbContextTenantFilterSpec._SeedAsync(seedDb);
		var (tenantB, postB) = await AppDbContextTenantFilterSpec._SeedAsync(seedDb);

		// Tenant context created before the no-tenant read.
		await using var dbB = await this._NewDbAsync(tenantB);
		_ = await dbB.Post.CountAsync();

		var seenByNone = await seedDb.Post.Select(p => p.Id).ToListAsync();
		seenByNone.Should().Contain([postA, postB]);
	}
}
