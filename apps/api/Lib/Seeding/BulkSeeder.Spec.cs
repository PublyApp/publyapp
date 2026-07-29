using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Lib.Seeding;

// #1008: `just seed-bulk` used to crash on a second run with a duplicate-key violation on
// the filtered unique index on Tenant.Code, because every entity gets a fresh PK each run
// while the natural keys (Tenant.Code, User.Email, ...) stay fixed. These specs run the
// real BulkSeeder against a real Postgres (via ApiFixture), with small counts standing in
// for the production defaults (500 tenants / 8000+ users / ...), so they exercise the same
// code path the CLI does without the multi-second runtime of the full dataset.
public static class BulkSeederSpecSupport {
	public static BulkSeedDataGenerator CreateSmallGenerator() {
		return new BulkSeedDataGenerator(
			tenantCount: 6,
			staffUserCount: 2,
			powerUserCount: 1,
			crossTenantUserCount: 1,
			singleTenantUserCount: 2,
			projectsPerTenant: 3
		);
	}
}

public sealed class BulkSeederIdempotencySpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public BulkSeederIdempotencySpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldInsertEverythingOnFirstRunAndSkipEverythingOnSecondRun() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var firstSeeder = new BulkSeeder(batchSize: 50, generator: BulkSeederSpecSupport.CreateSmallGenerator());
		await firstSeeder.SeedBulkAsync(dbContext);

		var (tenantsAfterFirst, usersAfterFirst, accountsAfterFirst, projectsAfterFirst) = await CountBulkRowsAsync(dbContext);

		tenantsAfterFirst.Should().Be(6);
		usersAfterFirst.Should().Be(6);
		accountsAfterFirst.Should().BeGreaterThan(0);
		projectsAfterFirst.Should().BeGreaterThan(0);

		// A fresh generator instance mirrors a fresh `dotnet run -- seed-bulk` process,
		// which reseeds its own Random(12345) from scratch on every invocation.
		var secondSeeder = new BulkSeeder(batchSize: 50, generator: BulkSeederSpecSupport.CreateSmallGenerator());
		var act = async () => await secondSeeder.SeedBulkAsync(dbContext);
		await act.Should().NotThrowAsync("a second run must treat already-seeded rows as success, not a duplicate-key failure");

		var (tenantsAfterSecond, usersAfterSecond, accountsAfterSecond, projectsAfterSecond) = await CountBulkRowsAsync(dbContext);

		tenantsAfterSecond.Should().Be(tenantsAfterFirst);
		usersAfterSecond.Should().Be(usersAfterFirst);
		accountsAfterSecond.Should().Be(accountsAfterFirst);
		projectsAfterSecond.Should().Be(projectsAfterFirst);
	}

	private static async Task<(int Tenants, int Users, int Accounts, int Projects)> CountBulkRowsAsync(AppDbContext dbContext) {
		var tenants = await dbContext.Tenant.CountAsync(t => t.Code.StartsWith(BulkSeedConstants.TenantCodePrefix));
		var users = await dbContext.User.CountAsync(u => u.Email.EndsWith("@" + BulkSeedConstants.UserEmailDomain));
		var accounts = await dbContext.UserAccount
			.Where(ua => dbContext.User.Any(u => u.Id == ua.UserId && u.Email.EndsWith("@" + BulkSeedConstants.UserEmailDomain)))
			.CountAsync();
		var projects = await dbContext.Project.CountAsync(p => p.Name.StartsWith(BulkSeedConstants.ProjectNamePrefix));
		return (tenants, users, accounts, projects);
	}
}

public sealed class BulkSeederPartialReseedSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public BulkSeederPartialReseedSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldInsertOnlyTheMissingRowsWhenPartiallySeeded() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var seeder = new BulkSeeder(batchSize: 50, generator: BulkSeederSpecSupport.CreateSmallGenerator());
		await seeder.SeedBulkAsync(dbContext);

		// Hard-delete one whole tenant (with its dependents) and one standalone user
		// account, simulating the case the issue calls out as mattering most: a database
		// left partially seeded, not just "never seeded" or "fully seeded".
		// Picked dynamically (rather than hardcoding e.g. tenant 001) because the generator
		// marks ~10% of tenants deleted/suspended in-memory, so a hardcoded index could
		// land on a tenant that never received projects in the first place.
		var tenantIdWithProjects = await dbContext.Project.Select(p => p.TenantId).Distinct().FirstAsync();
		var removedTenant = await dbContext.Tenant.SingleAsync(t => t.Id == tenantIdWithProjects);
		var removedTenantCode = removedTenant.Code;
		var removedTenantId = removedTenant.GetRequiredId();

		var dependentAccounts = await dbContext.UserAccount.Where(ua => ua.TenantId == removedTenantId).ToListAsync();
		var dependentProjects = await dbContext.Project.Where(p => p.TenantId == removedTenantId).ToListAsync();
		dbContext.ForceHardDeleteRange(dependentAccounts);
		dbContext.ForceHardDeleteRange(dependentProjects);
		dbContext.ForceHardDelete(removedTenant);
		await dbContext.SaveChangesAsync();

		// A standalone gap unrelated to the removed tenant — picked among bulk-seeded users
		// specifically (ApiFixture's own startup seeders, e.g. OwnerBootstrapSeeder, create
		// unrelated accounts in the same table that must stay untouched by BulkSeeder).
		var standaloneAccount = await dbContext.UserAccount
			.Where(ua => dbContext.User.Any(u => u.Id == ua.UserId && u.Email.EndsWith("@" + BulkSeedConstants.UserEmailDomain)))
			.Where(ua => ua.TenantId != removedTenantId)
			.FirstAsync();
		var standaloneAccountKey = (standaloneAccount.UserId, standaloneAccount.Scope, standaloneAccount.TenantId, standaloneAccount.ProjectId);
		dbContext.ForceHardDelete(standaloneAccount);
		await dbContext.SaveChangesAsync();
		dbContext.ChangeTracker.Clear();

		var accountsBeforeReseed = await dbContext.UserAccount.CountAsync();

		var reseeder = new BulkSeeder(batchSize: 50, generator: BulkSeederSpecSupport.CreateSmallGenerator());
		await reseeder.SeedBulkAsync(dbContext);

		var tenantsAfterReseed = await dbContext.Tenant.CountAsync(t => t.Code.StartsWith(BulkSeedConstants.TenantCodePrefix));
		tenantsAfterReseed.Should().Be(6, "the missing tenant must be recreated, restoring the full set");

		var recreatedTenant = await dbContext.Tenant.SingleAsync(t => t.Code == removedTenantCode);
		recreatedTenant.GetRequiredId().Should().NotBe(removedTenantId, "a hard-deleted natural key gets a genuinely new row, not the old id");

		// Every project belonging to the recreated tenant must reference its NEW id, not
		// the generator's in-memory id from before persistence — this is the FK-remap this
		// issue's design hinges on: a tenant that already exists (or gets freshly
		// (re)inserted) must have its real persisted id propagated to dependents.
		var projectsForRecreatedTenant = await dbContext.Project.CountAsync(p => p.TenantId == recreatedTenant.GetRequiredId());
		projectsForRecreatedTenant.Should().Be(dependentProjects.Count, "the tenant's own deleted projects must all be recreated, and only those");
		var projectsWithStaleTenantId = await dbContext.Project.CountAsync(p => p.TenantId == removedTenantId);
		projectsWithStaleTenantId.Should().Be(0, "no project should ever reference the old, no-longer-existing tenant id");

		var accountsAfterReseed = await dbContext.UserAccount.CountAsync();
		accountsAfterReseed.Should().Be(
			accountsBeforeReseed + dependentAccounts.Count + 1,
			"the tenant's own deleted accounts plus the single standalone gap should be filled; nothing else should be re-inserted"
		);

		var matchingAccounts = await dbContext.UserAccount.CountAsync(ua =>
			ua.UserId == standaloneAccountKey.UserId
			&& ua.Scope == standaloneAccountKey.Scope
			&& ua.TenantId == standaloneAccountKey.TenantId
			&& ua.ProjectId == standaloneAccountKey.ProjectId
		);
		matchingAccounts.Should().Be(1, "the recreated account must not be duplicated");
	}
}

public sealed class BulkSeederSoftDeleteTrapSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public BulkSeederSoftDeleteTrapSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldNotDuplicateASoftDeletedNaturalKeyOnReseed() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var seeder = new BulkSeeder(batchSize: 50, generator: BulkSeederSpecSupport.CreateSmallGenerator());
		await seeder.SeedBulkAsync(dbContext);

		// Tenant.Code and User.Email are only unique among non-deleted rows (filtered
		// unique indexes), so a naive "does an active row exist" check would let a second
		// seed run insert a duplicate alongside a soft-deleted one. AppDbContext's own
		// SaveChanges override converts a plain Remove() into a soft delete (IsDeleted =
		// true), which is exactly the trap this issue calls out — reproduce it for real
		// rather than asserting against the seeder's own logic.
		var tenantToSoftDelete = await dbContext.Tenant.SingleAsync(t => t.Code == $"{BulkSeedConstants.TenantCodePrefix}001");
		dbContext.Remove(tenantToSoftDelete);
		await dbContext.SaveChangesAsync();
		dbContext.ChangeTracker.Clear();

		var reloadedTenant = await dbContext.Tenant.SingleAsync(t => t.Code == $"{BulkSeedConstants.TenantCodePrefix}001");
		reloadedTenant.IsDeleted.Should().BeTrue("the setup must actually produce a soft-deleted row, not a hard-deleted one");

		var tenantRowCountBeforeReseed = await dbContext.Tenant.CountAsync(t => t.Code == $"{BulkSeedConstants.TenantCodePrefix}001");

		var reseeder = new BulkSeeder(batchSize: 50, generator: BulkSeederSpecSupport.CreateSmallGenerator());
		var act = async () => await reseeder.SeedBulkAsync(dbContext);
		await act.Should().NotThrowAsync();

		var tenantRowCountAfterReseed = await dbContext.Tenant.CountAsync(t => t.Code == $"{BulkSeedConstants.TenantCodePrefix}001");
		tenantRowCountAfterReseed.Should().Be(
			tenantRowCountBeforeReseed,
			"a soft-deleted tenant must be recognized as already existing by natural key, not duplicated"
		);
	}
}
