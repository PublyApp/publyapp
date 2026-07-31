using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Tenants.Entities;

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

public sealed class BulkSeederSoftDeleteRatioSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public BulkSeederSoftDeleteRatioSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldMaterializeSoftDeleteRatiosForBulkSeedRows() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		// Use a dataset large enough for percentage materialization to be visibly non-zero
		// under 100% confidence and stable with the generator's fixed seed.
		var generator = new BulkSeedDataGenerator(
			tenantCount: 60,
			staffUserCount: 20,
			powerUserCount: 60,
			crossTenantUserCount: 40,
			singleTenantUserCount: 160,
			projectsPerTenant: 8
		);
		var seeder = new BulkSeeder(batchSize: 50, generator: generator);
		await seeder.SeedBulkAsync(dbContext);

		var totalTenants = await dbContext.Tenant.CountAsync(t => t.Code.StartsWith(BulkSeedConstants.TenantCodePrefix));
		var deletedTenants = await dbContext.Tenant.CountAsync(t =>
			t.Code.StartsWith(BulkSeedConstants.TenantCodePrefix) && t.IsDeleted
		);

		var totalUsers = await dbContext.User.CountAsync(u => u.Email.EndsWith("@" + BulkSeedConstants.UserEmailDomain));
		var deletedUsers = await dbContext.User.CountAsync(u =>
			u.Email.EndsWith("@" + BulkSeedConstants.UserEmailDomain) && u.IsDeleted
		);

		var totalProjects = await dbContext.Project.CountAsync(p => p.Name.StartsWith(BulkSeedConstants.ProjectNamePrefix));
		var deletedProjects = await dbContext.Project.CountAsync(p =>
			p.Name.StartsWith(BulkSeedConstants.ProjectNamePrefix) && p.IsDeleted
		);

		var tenantDeletedRatio = (double)deletedTenants / totalTenants;
		var userDeletedRatio = (double)deletedUsers / totalUsers;
		var projectDeletedRatio = (double)deletedProjects / totalProjects;

		tenantDeletedRatio.Should().BeInRange(0.05, 0.15, "tenant soft-delete ratio must align with tenant generator policy");
		userDeletedRatio.Should().BeInRange(0.05, 0.25, "user soft-delete ratio must align with user generator policy");
		projectDeletedRatio.Should().BeInRange(0.03, 0.08, "project soft-delete ratio must align with project generator policy");

		deletedTenants.Should().BeGreaterThan(0, "a 0% tenant soft-delete ratio regressed to zero");
		deletedUsers.Should().BeGreaterThan(0, "a 0% user soft-delete ratio regressed to zero");
		deletedProjects.Should().BeGreaterThan(0, "a 0% project soft-delete ratio regressed to zero");
		deletedTenants.Should().BeLessThan(totalTenants, "a 100% tenant soft-delete ratio would hide active rows");
		deletedUsers.Should().BeLessThan(totalUsers, "a 100% user soft-delete ratio would hide active rows");
		deletedProjects.Should().BeLessThan(totalProjects, "a 100% project soft-delete ratio would hide active rows");
	}
}

public sealed class BulkSeederGenuineFailureSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public BulkSeederGenuineFailureSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	// This used to induce SQLSTATE 23514 (a check violation), which sits entirely outside
	// the seeder's 23505 duplicate-key filter — it passed even with the production fix
	// reverted, proving nothing about the filter's own correctness (#1012 review).
	//
	// The genuine failure a 23505 filter must not swallow is a 23505 that *isn't* actually
	// "someone already inserted this": two brand-new rows in the SAME batch colliding with
	// EACH OTHER on the tenant natural-key index. Postgres raises 23505 against exactly the
	// constraint the seeder expects (ix_tenants_code_active) — the filter's first half
	// (constraint-name check) would let it through — but the whole batch rolls back, so
	// neither row is ever persisted. The filter's second half (post-rollback existence
	// check) must recognize that and rethrow rather than report a skip.
	[Fact]
	public async Task ItShouldThrowWhenAGenuineNonDuplicateFailureOccurs() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var seeder = new BulkSeeder(batchSize: 50);
		var duplicateCode = $"{BulkSeedConstants.TenantCodePrefix}self-collision";
		var tenantA = new Tenant { Id = Guid.CreateVersion7(), Code = duplicateCode, Name = "Self Collision A", MaxUsers = 10 };
		var tenantB = new Tenant { Id = Guid.CreateVersion7(), Code = duplicateCode, Name = "Self Collision B", MaxUsers = 10 };

		var act = async () => await seeder.SeedTenantsInBatchesAsync(dbContext, [tenantA, tenantB], CancellationToken.None);

		var thrown = await act.Should().ThrowAsync<DbUpdateException>(
			"a 23505 on the tenant natural-key index that rolls back BOTH colliding rows is not the same thing as " +
			"'someone already inserted this' and must propagate, not be caught and skipped"
		);
		var pgEx = thrown.Which.InnerException.Should().BeOfType<Npgsql.PostgresException>().Subject;
		pgEx.SqlState.Should().Be("23505", "the induced failure is the same unique-violation SQLSTATE the seeder tolerates");
		pgEx.ConstraintName.Should().Be(
			"ix_tenants_code_active",
			"this must be the seeder's OWN expected natural-key constraint — proving the constraint-name check alone is not enough"
		);

		var persisted = await dbContext.Tenant.AsNoTracking().AnyAsync(t => t.Code == duplicateCode);
		persisted.Should().BeFalse("the whole batch rolled back, so neither colliding row should have made it to disk");
	}
}

public sealed class BulkSeederUnrelatedUniqueViolationSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public BulkSeederUnrelatedUniqueViolationSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	// Reproduces the #1012 review BLOCKER directly: SQLSTATE 23505 means "some unique
	// index was violated", not "this entity's natural key already exists". An unrelated
	// unique index on the same table (simulating schema drift) also raises 23505, and the
	// pre-fix filter matched on SqlState alone — swallowing it, rolling back the whole
	// batch, and finishing with "Bulk seed completed!" while the projects were silently
	// never inserted.
	[Fact]
	public async Task ItShouldThrowWhenAnUnrelatedUniqueIndexCollidesDuringTheProjectPhase() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var seeder = new BulkSeeder(batchSize: 50, generator: BulkSeederSpecSupport.CreateSmallGenerator());
		await seeder.SeedBulkAsync(dbContext);

		// Hard-delete only the generated projects, leaving their parent tenants/users/
		// accounts intact — the project phase must genuinely attempt to reinsert all of
		// them on the next run.
		var bulkProjects = await dbContext.Project
			.Where(p => p.Name.StartsWith(BulkSeedConstants.ProjectNamePrefix))
			.ToListAsync();
		bulkProjects.Should().NotBeEmpty("the small generator must produce at least one project for this repro to be meaningful");
		dbContext.ForceHardDeleteRange(bulkProjects);
		await dbContext.SaveChangesAsync();
		dbContext.ChangeTracker.Clear();

		// Simulate schema drift: a unique index on "projects" that has nothing to do with
		// the seeder's (TenantId, Name) natural key. A constant expression scoped to bulk
		// project names means any TWO bulk projects inserted in the same batch collide,
		// regardless of which tenant or name they carry.
		await dbContext.Database.ExecuteSqlRawAsync(
			"CREATE UNIQUE INDEX test_ix_projects_drift ON \"projects\" ((1)) " +
			"WHERE \"name\" LIKE 'Bulk Project %'"
		);

		var reseeder = new BulkSeeder(batchSize: 50, generator: BulkSeederSpecSupport.CreateSmallGenerator());
		var act = async () => await reseeder.SeedBulkAsync(dbContext);

		var thrown = await act.Should().ThrowAsync<DbUpdateException>(
			"an unrelated unique-index violation must propagate as a genuine failure, not be reported as a successful, " +
			"idempotent skip while the batch's projects are silently missing"
		);
		var pgEx = thrown.Which.InnerException.Should().BeOfType<Npgsql.PostgresException>().Subject;
		pgEx.SqlState.Should().Be("23505");
		pgEx.ConstraintName.Should().Be(
			"test_ix_projects_drift",
			"the violated index is unrelated to the seeder's own (TenantId, Name) natural key (IX_projects_tenant_id_name)"
		);

		var projectsAfterFailedReseed = await dbContext.Project.CountAsync(p => p.Name.StartsWith(BulkSeedConstants.ProjectNamePrefix));
		projectsAfterFailedReseed.Should().Be(0, "the failed batch must have rolled back rather than partially or silently applying");
	}
}

public sealed class BulkSeederNaturalKeyIndexContractSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public BulkSeederNaturalKeyIndexContractSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	// #1012 round-2 review MINOR: BulkSeederGenuineFailureSpec induces and asserts only
	// ix_tenants_code_active. The other five index names BulkSeeder relies on to tell "this
	// natural key already exists" apart from "an unrelated unique index was violated" are
	// never driven by any test — the ordinary idempotency spec never reaches a catch at all
	// (its second run filters existing rows out before insert), and the unrelated-index spec
	// passes either way because it wants a rethrow regardless of the project index's name.
	//
	// Concretely: a future migration renames, say, IX_projects_tenant_id_name and correctly
	// updates the EF model, but nobody updates BulkSeeder's private string. Every clean seed
	// and every ordinary repeat seed stays green. Then a legitimate concurrent insert makes
	// Postgres report the duplicate under the NEW name, the filter no longer matches, and
	// seed-bulk throws instead of skipping — issue #1008 reintroduced silently.
	//
	// This asserts BulkSeeder's OWN constants — not a second hardcoded list here that a
	// rename could update alongside the migration while leaving the application string
	// stale — against pg_indexes on a fully migrated test database (the artifact itself,
	// not the EF model).
	[Fact]
	public async Task ItShouldHaveALiveMigratedIndexForEveryNaturalKeyConstraintBulkSeederConsumes() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var expectedIndexNames = BulkSeeder.TenantNaturalKeyConstraints
			.Concat(BulkSeeder.UserNaturalKeyConstraints)
			.Concat(BulkSeeder.UserAccountNaturalKeyConstraints)
			.Concat(BulkSeeder.ProjectNaturalKeyConstraints)
			.ToList();

		var liveIndexNames = await dbContext.Database.SqlQuery<string>(
			$"""
			SELECT indexname AS "Value"
			FROM pg_indexes
			WHERE schemaname = 'public'
			"""
		).ToListAsync();
		var liveIndexNameSet = liveIndexNames.ToHashSet();

		var missingIndexNames = expectedIndexNames.Where(name => !liveIndexNameSet.Contains(name)).ToList();

		missingIndexNames.Should().BeEmpty(
			"BulkSeeder's duplicate-handling catches only absorb a 23505 on these exact index " +
			$"names; a missing name here means a migration renamed the live index without " +
			$"updating BulkSeeder's constant, and seed-bulk would throw instead of skip on the " +
			$"next legitimate concurrent duplicate (missing from the migrated schema: " +
			$"{string.Join(", ", missingIndexNames)})"
		);
	}
}
