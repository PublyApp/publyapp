using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fakes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Projects.Entities;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Providers.Bluesky;
using PublyApp.Api.Modules.Tenants.Entities;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Services;

// Service-level proofs for Epic C step 2 (Bluesky connect), spec §6: the network is
// faked everywhere (FakeBlueskyClient singleton per fixture). Every spec class owns an
// EXCLUSIVE ApiFixture so programmable outcomes (NextResult) and the recorded attempts
// never leak between classes.

public sealed class SocialAccountServiceConnectSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public SocialAccountServiceConnectSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldStoreActiveAccountWithProtectedSecretOnFirstConnect() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var sp = scope.ServiceProvider;
		var db = sp.GetRequiredService<AppDbContext>();
		var tenantId = await SeedTenantAsync(db);
		var service = sp.GetRequiredService<SocialAccountService>();
		var fake = sp.GetRequiredService<FakeBlueskyClient>();

		var result = await service.ConnectForTenantAsync(
			tenantId, "alice@example.com", "app-password-one"
		);

		var connected = result.Should()
			.BeOfType<ConnectSocialAccountResult.Connected>().Subject;
		connected.AlreadyConnected.Should().BeFalse();
		connected.Account.Status.Should().Be(SocialAccountStatus.Active);
		connected.Account.ExternalAccountId.Should().StartWith("did:plc:");
		connected.Account.DisplayHandle.Should().Be("alice.test");
		fake.Attempts.Should().ContainSingle(a => a.Identifier == "alice@example.com");

		// Independent context: the secret at rest is protected, never the plaintext.
		await using var verify = CreateFreshDbContext(db);
		var row = await verify.SocialAccount.SingleAsync(
			a => a.Id == connected.Account.GetRequiredId()
		);
		row.ProtectedCredentials.Should().NotBeEmpty();
		row.ProtectedCredentials.Should().NotContain("app-password-one");
	}

	[Fact]
	public async Task ItShouldStoreNothingWhenBlueskyRefusedTheCredentials() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var sp = scope.ServiceProvider;
		var db = sp.GetRequiredService<AppDbContext>();
		var tenantId = await SeedTenantAsync(db);
		var service = sp.GetRequiredService<SocialAccountService>();
		var fake = sp.GetRequiredService<FakeBlueskyClient>();
		fake.NextResult = new BlueskySessionResult.AccountFailure(
			"Credentials were refused by Bluesky."
		);

		var result = await service.ConnectForTenantAsync(
			tenantId, "ghost@example.com", "wrong-secret"
		);

		result.Should().BeOfType<ConnectSocialAccountResult.Refused>();
		await using var verify = CreateFreshDbContext(db);
		(await verify.SocialAccount.CountAsync(a => a.TenantId == tenantId))
			.Should().Be(0);
	}

	[Fact]
	public async Task ItShouldStoreNothingWhenBlueskyIsUnreachable() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var sp = scope.ServiceProvider;
		var db = sp.GetRequiredService<AppDbContext>();
		var tenantId = await SeedTenantAsync(db);
		var service = sp.GetRequiredService<SocialAccountService>();
		sp.GetRequiredService<FakeBlueskyClient>().NextResult =
			new BlueskySessionResult.Transient();

		var result = await service.ConnectForTenantAsync(
			tenantId, "offline@example.com", "whatever"
		);

		result.Should().BeOfType<ConnectSocialAccountResult.Unreachable>();
		await using var verify = CreateFreshDbContext(db);
		(await verify.SocialAccount.CountAsync(a => a.TenantId == tenantId))
			.Should().Be(0);
	}

	[Fact]
	public async Task ItShouldReuseTheSameRowWhenTheSameDidConnectsAgain() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var sp = scope.ServiceProvider;
		var db = sp.GetRequiredService<AppDbContext>();
		var tenantId = await SeedTenantAsync(db);
		var service = sp.GetRequiredService<SocialAccountService>();

		var first = (ConnectSocialAccountResult.Connected)await service
			.ConnectForTenantAsync(tenantId, "reuse@example.com", "pw-1");
		var second = (ConnectSocialAccountResult.Connected)await service
			.ConnectForTenantAsync(tenantId, "reuse@example.com", "pw-2");

		second.AlreadyConnected.Should().BeTrue();
		second.Account.GetRequiredId().Should().Be(first.Account.GetRequiredId());
		(await db.SocialAccount.CountAsync(a => a.TenantId == tenantId))
			.Should().Be(1);
	}

	private static AppDbContext CreateFreshDbContext(AppDbContext reference) {
		var connectionString = reference.Database.GetConnectionString();
		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
	}

	private static async Task<Guid> SeedTenantAsync(AppDbContext db) {
		var tenant = new Tenant {
			Name = $"Social Connect {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		db.Tenant.Add(tenant);
		await db.SaveChangesAsync();
		return tenant.GetRequiredId();
	}
}

public sealed class SocialAccountServiceDisconnectSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public SocialAccountServiceDisconnectSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldRevokeAndEraseTheStoredSecretOnDisconnect() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var sp = scope.ServiceProvider;
		var db = sp.GetRequiredService<AppDbContext>();
		var tenantId = await SeedTenantAsync(db);
		var service = sp.GetRequiredService<SocialAccountService>();
		var connected = (ConnectSocialAccountResult.Connected)await service
			.ConnectForTenantAsync(tenantId, "bye@example.com", "app-password");
		var accountId = connected.Account.GetRequiredId();

		var result = await service.DisconnectForTenantAsync(tenantId, accountId);

		var disconnected = result.Should()
			.BeOfType<DisconnectSocialAccountResult.Disconnected>().Subject;
		disconnected.Account.Status.Should().Be(SocialAccountStatus.Revoked);

		await using var verify = CreateFreshDbContext(db);
		var row = await verify.SocialAccount.SingleAsync(a => a.Id == accountId);
		row.Status.Should().Be(SocialAccountStatus.Revoked);
		row.ProtectedCredentials.Should().BeEmpty();
		row.IsDeleted.Should().BeFalse(); // history kept (soft delete untouched)
	}

	[Fact]
	public async Task ItShouldReturnNotFoundWhenAnotherTenantDisconnects() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var sp = scope.ServiceProvider;
		var db = sp.GetRequiredService<AppDbContext>();
		var tenantA = await SeedTenantAsync(db);
		var tenantB = await SeedTenantAsync(db);
		var service = sp.GetRequiredService<SocialAccountService>();
		var connected = (ConnectSocialAccountResult.Connected)await service
			.ConnectForTenantAsync(tenantA, "mine@example.com", "app-password");
		var accountId = connected.Account.GetRequiredId();

		var result = await service.DisconnectForTenantAsync(tenantB, accountId);

		result.Should().BeOfType<DisconnectSocialAccountResult.NotFound>();
		var row = await db.SocialAccount.SingleAsync(a => a.Id == accountId);
		row.Status.Should().Be(SocialAccountStatus.Active);
		row.ProtectedCredentials.Should().NotBeEmpty();
	}

	private static AppDbContext CreateFreshDbContext(AppDbContext reference) {
		var connectionString = reference.Database.GetConnectionString();
		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
	}

	private static async Task<Guid> SeedTenantAsync(AppDbContext db) {
		var tenant = new Tenant {
			Name = $"Social Disconnect {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		db.Tenant.Add(tenant);
		await db.SaveChangesAsync();
		return tenant.GetRequiredId();
	}
}

public sealed class SocialAccountServiceReconnectSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public SocialAccountServiceReconnectSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldReplaceSecretAndReactivateOnReconnect() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var sp = scope.ServiceProvider;
		var db = sp.GetRequiredService<AppDbContext>();
		var tenantId = await SeedTenantAsync(db);
		var service = sp.GetRequiredService<SocialAccountService>();
		var connected = (ConnectSocialAccountResult.Connected)await service
			.ConnectForTenantAsync(tenantId, "flaky@example.com", "old-password");
		var accountId = connected.Account.GetRequiredId();
		var rowBefore = await db.SocialAccount.SingleAsync(a => a.Id == accountId);
		rowBefore.Status = SocialAccountStatus.NeedsReconnect;
		rowBefore.LastError = "Session expired.";
		await db.SaveChangesAsync();
		// Capture BEFORE reconnect: db tracks the same entity the service mutates,
		// so reading rowBefore afterwards would silently observe the new secret.
		var secretBefore = rowBefore.ProtectedCredentials;

		var result = await service.ReconnectForTenantAsync(
			tenantId, accountId, "new-password"
		);

		var reconnected = result.Should()
			.BeOfType<ReconnectSocialAccountResult.Reconnected>().Subject;
		reconnected.Account.Status.Should().Be(SocialAccountStatus.Active);

		await using var verify = CreateFreshDbContext(db);
		var rowAfter = await verify.SocialAccount.SingleAsync(a => a.Id == accountId);
		rowAfter.Status.Should().Be(SocialAccountStatus.Active);
		rowAfter.LastError.Should().BeNull();
		rowAfter.ProtectedCredentials.Should()
			.NotBe(secretBefore)
			.And.NotContain("new-password")
			.And.NotBeEmpty();
	}

	[Fact]
	public async Task ItShouldLeaveTheStoredRowUntouchedWhenReconnectRefused() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var sp = scope.ServiceProvider;
		var db = sp.GetRequiredService<AppDbContext>();
		var tenantId = await SeedTenantAsync(db);
		var service = sp.GetRequiredService<SocialAccountService>();
		var connected = (ConnectSocialAccountResult.Connected)await service
			.ConnectForTenantAsync(tenantId, "locked@example.com", "good-password");
		var accountId = connected.Account.GetRequiredId();
		var rowBefore = await db.SocialAccount.SingleAsync(a => a.Id == accountId);
		rowBefore.Status = SocialAccountStatus.NeedsReconnect;
		await db.SaveChangesAsync();
		sp.GetRequiredService<FakeBlueskyClient>().NextResult =
			new BlueskySessionResult.AccountFailure("Credentials were refused.");

		var result = await service.ReconnectForTenantAsync(
			tenantId, accountId, "bad-password"
		);

		result.Should().BeOfType<ReconnectSocialAccountResult.Refused>();
		await using var verify = CreateFreshDbContext(db);
		var rowAfter = await verify.SocialAccount.SingleAsync(a => a.Id == accountId);
		rowAfter.Status.Should().Be(SocialAccountStatus.NeedsReconnect);
		rowAfter.ProtectedCredentials.Should().Be(rowBefore.ProtectedCredentials);
	}

	[Fact]
	public async Task ItShouldTreatRevokedAccountAsNotFoundOnReconnect() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var sp = scope.ServiceProvider;
		var db = sp.GetRequiredService<AppDbContext>();
		var tenantId = await SeedTenantAsync(db);
		var service = sp.GetRequiredService<SocialAccountService>();
		var connected = (ConnectSocialAccountResult.Connected)await service
			.ConnectForTenantAsync(tenantId, "gone@example.com", "password");
		var accountId = connected.Account.GetRequiredId();
		await service.DisconnectForTenantAsync(tenantId, accountId);

		var result = await service.ReconnectForTenantAsync(
			tenantId, accountId, "password"
		);

		result.Should().BeOfType<ReconnectSocialAccountResult.NotFound>();
	}

	private static AppDbContext CreateFreshDbContext(AppDbContext reference) {
		var connectionString = reference.Database.GetConnectionString();
		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
	}

	private static async Task<Guid> SeedTenantAsync(AppDbContext db) {
		var tenant = new Tenant {
			Name = $"Social Reconnect {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		db.Tenant.Add(tenant);
		await db.SaveChangesAsync();
		return tenant.GetRequiredId();
	}
}

public sealed class SocialAccountServiceFindSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public SocialAccountServiceFindSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldPageNewestFirstAcrossCursorPages() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var sp = scope.ServiceProvider;
		var db = sp.GetRequiredService<AppDbContext>();
		var tenantId = await SeedTenantAsync(db);
		var service = sp.GetRequiredService<SocialAccountService>();
		var ids = new List<Guid>();
		for (var i = 0; i < 3; i++) {
			var connected = (ConnectSocialAccountResult.Connected)await service
				.ConnectForTenantAsync(tenantId, $"page{i}@example.com", "pw");
			ids.Add(connected.Account.GetRequiredId());
		}

		var page1 = (FindSocialAccountsResult.Success)await service.FindForTenantAsync(
			tenantId,
			new FindSocialAccountsArgs(Guid.Empty, 2, null, null, null)
		);
		page1.Data.Data.Should().HaveCount(2);
		page1.Data.NextCursor.Should().NotBeNull();

		var page2 = (FindSocialAccountsResult.Success)await service.FindForTenantAsync(
			tenantId,
			new FindSocialAccountsArgs(
				Guid.Parse(page1.Data.NextCursor!), 2, null, null, null
			)
		);

		page2.Data.Data.Should().ContainSingle();
		page2.Data.Data[0].Id.Should().Be(ids[0]); // oldest lands on the last page
		page2.Data.NextCursor.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldFilterByProjectVisibility() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var sp = scope.ServiceProvider;
		var db = sp.GetRequiredService<AppDbContext>();
		var tenantId = await SeedTenantAsync(db);
		var service = sp.GetRequiredService<SocialAccountService>();
		var projectA = new Project {
			TenantId = tenantId,
			Name = "Alpha",
			Description = null,
		};
		var projectB = new Project {
			TenantId = tenantId,
			Name = "Beta",
			Description = null,
		};
		db.Project.AddRange(projectA, projectB);
		await db.SaveChangesAsync();
		var attached = (ConnectSocialAccountResult.Connected)await service
			.ConnectForTenantAsync(tenantId, "attached@example.com", "pw");
		var unattached = (ConnectSocialAccountResult.Connected)await service
			.ConnectForTenantAsync(tenantId, "roaming@example.com", "pw");
		await service.SetProjectsForTenantAsync(
			tenantId, attached.Account.GetRequiredId(), [projectA.GetRequiredId()]
		);

		// Visibility (spec §2): unattached accounts are visible everywhere, attached
		// ones only in their projects. Alpha sees BOTH; Beta sees only the unattached.
		var forAlpha = (FindSocialAccountsResult.Success)await service
			.FindForTenantAsync(
				tenantId,
				new FindSocialAccountsArgs(
					Guid.Empty, 50, null, null, projectA.GetRequiredId()
				)
			);
		forAlpha.Data.Data.Select(i => i.Id).Should().BeEquivalentTo([
			attached.Account.GetRequiredId(),
			unattached.Account.GetRequiredId(),
		]);

		var forBeta = (FindSocialAccountsResult.Success)await service
			.FindForTenantAsync(
				tenantId,
				new FindSocialAccountsArgs(
					Guid.Empty, 50, null, null, projectB.GetRequiredId()
				)
			);
		forBeta.Data.Data.Select(i => i.Id).Should().Equal(
			unattached.Account.GetRequiredId()
		);

		var unfiltered = (FindSocialAccountsResult.Success)await service
			.FindForTenantAsync(
				tenantId, new FindSocialAccountsArgs(Guid.Empty, 50, null, null, null)
			);
		unfiltered.Data.Data.Should().HaveCount(2);
	}

	[Fact]
	public async Task ItShouldNeverLeakAnotherTenantsAccounts() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var sp = scope.ServiceProvider;
		var db = sp.GetRequiredService<AppDbContext>();
		var tenantA = await SeedTenantAsync(db);
		var tenantB = await SeedTenantAsync(db);
		var service = sp.GetRequiredService<SocialAccountService>();
		await service.ConnectForTenantAsync(tenantA, "a@example.com", "pw");
		await service.ConnectForTenantAsync(tenantB, "b@example.com", "pw");

		var forA = (FindSocialAccountsResult.Success)await service.FindForTenantAsync(
			tenantA, new FindSocialAccountsArgs(Guid.Empty, 50, null, null, null)
		);

		forA.Data.Data.Should().ContainSingle();
		forA.Data.Data[0].DisplayHandle.Should().Be("a.test");
	}

	[Fact]
	public async Task ItShouldRejectAnUnknownSortId() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var sp = scope.ServiceProvider;
		var db = sp.GetRequiredService<AppDbContext>();
		var tenantId = await SeedTenantAsync(db);
		var service = sp.GetRequiredService<SocialAccountService>();

		var result = await service.FindForTenantAsync(
			tenantId,
			new FindSocialAccountsArgs(Guid.Empty, 50, "handle", null, null)
		);

		result.Should().BeOfType<FindSocialAccountsResult.InvalidSortId>();
	}

	private static async Task<Guid> SeedTenantAsync(AppDbContext db) {
		var tenant = new Tenant {
			Name = $"Social Find {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		db.Tenant.Add(tenant);
		await db.SaveChangesAsync();
		return tenant.GetRequiredId();
	}
}

public sealed class SocialAccountServiceSetProjectsSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public SocialAccountServiceSetProjectsSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldReplaceAttachmentsOnSetProjects() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var sp = scope.ServiceProvider;
		var db = sp.GetRequiredService<AppDbContext>();
		var tenantId = await SeedTenantAsync(db);
		var service = sp.GetRequiredService<SocialAccountService>();
		var p1 = new Project { TenantId = tenantId, Name = "One" };
		var p2 = new Project { TenantId = tenantId, Name = "Two" };
		db.Project.AddRange(p1, p2);
		await db.SaveChangesAsync();
		var connected = (ConnectSocialAccountResult.Connected)await service
			.ConnectForTenantAsync(tenantId, "projects@example.com", "pw");
		var accountId = connected.Account.GetRequiredId();

		await service.SetProjectsForTenantAsync(
			tenantId, accountId, [p1.GetRequiredId(), p2.GetRequiredId()]
		);
		var applied = (SetSocialAccountProjectsResult.Applied)await service
			.SetProjectsForTenantAsync(
				tenantId, accountId, [p2.GetRequiredId()]
			);

		applied.AttachedCount.Should().Be(0);
		applied.DetachedCount.Should().Be(1);
		db.SocialAccountProject.Where(l => l.SocialAccountId == accountId)
			.Select(l => l.ProjectId)
			.Should().Equal([p2.GetRequiredId()]);
	}

	[Fact]
	public async Task ItShouldRejectAProjectFromAnotherTenant() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var sp = scope.ServiceProvider;
		var db = sp.GetRequiredService<AppDbContext>();
		var tenantA = await SeedTenantAsync(db);
		var tenantB = await SeedTenantAsync(db);
		var service = sp.GetRequiredService<SocialAccountService>();
		var foreignProject = new Project { TenantId = tenantB, Name = "Foreign" };
		db.Project.Add(foreignProject);
		await db.SaveChangesAsync();
		var connected = (ConnectSocialAccountResult.Connected)await service
			.ConnectForTenantAsync(tenantA, "guard@example.com", "pw");
		var accountId = connected.Account.GetRequiredId();

		var result = await service.SetProjectsForTenantAsync(
			tenantA, accountId, [foreignProject.GetRequiredId()]
		);

		var invalid = result.Should()
			.BeOfType<SetSocialAccountProjectsResult.InvalidProject>().Subject;
		invalid.ProjectId.Should().Be(foreignProject.GetRequiredId());
		db.SocialAccountProject.Where(l => l.SocialAccountId == accountId)
			.Should().BeEmpty();
	}

	[Fact]
	public async Task ItShouldMakeTheAccountVisibleEverywhereWithAnEmptySet() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var sp = scope.ServiceProvider;
		var db = sp.GetRequiredService<AppDbContext>();
		var tenantId = await SeedTenantAsync(db);
		var service = sp.GetRequiredService<SocialAccountService>();
		var project = new Project { TenantId = tenantId, Name = "Solo" };
		db.Project.Add(project);
		await db.SaveChangesAsync();
		var connected = (ConnectSocialAccountResult.Connected)await service
			.ConnectForTenantAsync(tenantId, "everywhere@example.com", "pw");
		var accountId = connected.Account.GetRequiredId();
		await service.SetProjectsForTenantAsync(
			tenantId, accountId, [project.GetRequiredId()]
		);

		var applied = (SetSocialAccountProjectsResult.Applied)await service
			.SetProjectsForTenantAsync(tenantId, accountId, []);

		applied.DetachedCount.Should().Be(1);
		db.SocialAccountProject.Where(l => l.SocialAccountId == accountId)
			.Should().BeEmpty();
	}

	private static async Task<Guid> SeedTenantAsync(AppDbContext db) {
		var tenant = new Tenant {
			Name = $"Social Projects {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		db.Tenant.Add(tenant);
		await db.SaveChangesAsync();
		return tenant.GetRequiredId();
	}
}
