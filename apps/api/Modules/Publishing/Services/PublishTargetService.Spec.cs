using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Projects.Entities;
using PublyApp.Api.Modules.SocialAccounts.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Services;

// Direct-invocation integration spec for PublishTargetService (D2 Task 4).
// THE single-source visibility rule (VisibleIn.Visible) decides which accounts a
// composer may target; this spec pins the Active filter, the tenant scope, and
// the stable created_at/id order over real ephemeral Postgres.
public sealed class PublishTargetServiceSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public PublishTargetServiceSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldReturnOnlyActiveTenantTargetsInCreatedAtIdOrder() {
		await using var db = await NewDbAsync();
		var (tenantId, foreignTenantId) = await SeedTenantsAsync(db);

		var oldActive = await SeedAccountAsync(
			db, tenantId, "@targets-old.bsky.social",
			SocialAccountStatus.Active, minutesAgo: 120
		);
		var everywhere = await SeedAccountAsync(
			db, tenantId, "@targets-everywhere.bsky.social",
			SocialAccountStatus.Active, minutesAgo: 90
		);
		var recentActive = await SeedAccountAsync(
			db, tenantId, "@targets-recent.bsky.social",
			SocialAccountStatus.Active, minutesAgo: 60
		);
		await SeedAccountAsync(
			db, tenantId, "@targets-stale.bsky.social",
			SocialAccountStatus.NeedsReconnect, minutesAgo: 30
		);
		await SeedAccountAsync(
			db, foreignTenantId, "@foreign-target.bsky.social",
			SocialAccountStatus.Active, minutesAgo: 10
		);

		var service = new PublishTargetService(db);

		var targets = await service.FindForTenantAsync(tenantId);

		targets.Select(target => target.Id).Should()
			.Equal([recentActive, everywhere, oldActive],
				"only Active tenant accounts survive, newest-first");
		targets.Single(target => target.Id == recentActive).Provider.Should()
			.Be("bluesky");
	}

	[Fact]
	public async Task ItShouldApplyTheSingleVisibilityRulePerProject() {
		await using var db = await NewDbAsync();
		var (tenantId, _) = await SeedTenantsAsync(db);

		var attached = await SeedAccountAsync(
			db, tenantId, "@targets-attached.bsky.social",
			SocialAccountStatus.Active, minutesAgo: 100
		);
		var roaming = await SeedAccountAsync(
			db, tenantId, "@targets-roaming.bsky.social",
			SocialAccountStatus.Active, minutesAgo: 80
		);
		var projectOne = await SeedProjectAsync(db, tenantId);
		var projectTwo = await SeedProjectAsync(db, tenantId);
		db.SocialAccountProject.Add(new SocialAccountProject {
			SocialAccountId = attached,
			ProjectId = projectOne,
		});
		await db.SaveChangesAsync();

		var service = new PublishTargetService(db);

		var underOne = await service.FindForTenantAsync(tenantId, projectOne);
		var underTwo = await service.FindForTenantAsync(tenantId, projectTwo);

		underOne.Select(target => target.Id).Should()
			.Equal([roaming, attached],
				"project members and unattached (everywhere) accounts pass "
					+ "VisibleIn, newest-first");

		underTwo.Select(target => target.Id).Should()
			.Equal([roaming], "an unattached account is visible to every project");
	}

	[Fact]
	public async Task ItShouldNeverLeakAnotherTenantsAccounts() {
		await using var db = await NewDbAsync();
		var (tenantId, foreignTenantId) = await SeedTenantsAsync(db);

		await SeedAccountAsync(
			db, foreignTenantId, "@leak-probe.bsky.social",
			SocialAccountStatus.Active, minutesAgo: 1
		);

		var service = new PublishTargetService(db);

		var targets = await service.FindForTenantAsync(tenantId);

		targets.Should().BeEmpty(
			"the query is tenant-scoped before any other rule applies"
		);
	}

	// ── helpers ────────────────────────────────────────────────────────

	private async Task<AppDbContext> NewDbAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException(
				"Test database connection string was unexpectedly null."
			);
		}

		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
	}

	private static async Task<(Guid TenantId, Guid ForeignTenantId)> SeedTenantsAsync(
		AppDbContext db
	) {
		var tenant = new PublyApp.Api.Modules.Tenants.Entities.Tenant {
			Name = $"pub-targets-{Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = PublyApp.Api.Modules.Tenants.Entities.TenantStatus.Active,
			MaxUsers = 10,
		};
		var foreign = new PublyApp.Api.Modules.Tenants.Entities.Tenant {
			Name = $"pub-targets-f-{Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = PublyApp.Api.Modules.Tenants.Entities.TenantStatus.Active,
			MaxUsers = 10,
		};
		db.Tenant.Add(tenant);
		db.Tenant.Add(foreign);
		await db.SaveChangesAsync();
		return (tenant.GetRequiredId(), foreign.GetRequiredId());
	}

	// The SaveChanges interceptor rewrites CreatedAt for BaseAttributesNoKey
	// descendants on insert, so the pinned creation order is applied with a raw
	// UPDATE afterwards.
	private static async Task<Guid> SeedAccountAsync(
		AppDbContext db,
		Guid tenantId,
		string displayHandle,
		SocialAccountStatus status,
		int minutesAgo
	) {
		var account = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = displayHandle,
			ProtectedCredentials = "enc-spec-blob",
			Status = status,
		};
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();
		var createdAt = DateTime.UtcNow.AddMinutes(-minutesAgo);
		await db.Database.ExecuteSqlInterpolatedAsync(
			$"UPDATE social_accounts SET created_at = {createdAt}, updated_at = {createdAt} WHERE id = {account.GetRequiredId()}"
		);
		return account.GetRequiredId();
	}

	private static async Task<Guid> SeedProjectAsync(
		AppDbContext db,
		Guid tenantId
	) {
		var project = new Project {
			TenantId = tenantId,
			Name = $"publish-targets-{Guid.NewGuid():N}"[..40],
		};
		db.Project.Add(project);
		await db.SaveChangesAsync();
		return project.GetRequiredId();
	}
}
