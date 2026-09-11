using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Services;

// Direct-invocation integration spec (real ephemeral Postgres, no HTTP surface):
// pins the read-only queue finder behind C4 reconnect/resume and disconnect/pause
// orchestration — tenant-scoped loads, non-terminal rows only, honest instants.
public sealed class PublicationQueueServiceSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;

	public PublicationQueueServiceSpec(ApiFixture fixture) {
		_Fixture = fixture;
	}

	private async Task<AppDbContext> _NewDbAsync() {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
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

	private static PublicationQueueService _NewService(AppDbContext db) {
		return new PublicationQueueService(db);
	}

	private static async Task<(Guid TenantId, Guid AccountId, Guid UserId)>
		_SeedTenantAndAccountAsync(AppDbContext db) {
		var tenant = new PublyApp.Api.Modules.Tenants.Entities.Tenant {
			Name = $"pub-queue-{Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = PublyApp.Api.Modules.Tenants.Entities.TenantStatus.Active,
			MaxUsers = 10,
		};
		var user = new User {
			Email = $"pub-queue-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true,
		};
		db.Tenant.Add(tenant);
		db.User.Add(user);
		await db.SaveChangesAsync();

		var account = new SocialAccount {
			TenantId = tenant.GetRequiredId(),
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@queuespec.bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();

		return (tenant.GetRequiredId(), account.GetRequiredId(), user.GetRequiredId());
	}

	private static async Task<Guid> _SeedPublicationAsync(
		AppDbContext db,
		Guid tenantId,
		Guid accountId,
		Guid userId,
		PublicationStatus status,
		DateTime scheduledAtUtc
	) {
		var post = new Post {
			TenantId = tenantId,
			Body = "queue spec body",
			CreatedByUserId = userId,
		};
		db.Post.Add(post);
		await db.SaveChangesAsync();

		var publication = new Publication {
			TenantId = tenantId,
			PostId = post.GetRequiredId(),
			SocialAccountId = accountId,
			Status = status,
			ScheduledAtUtc = scheduledAtUtc,
			ScheduledTimeZone = "Etc/UTC",
			IdempotencyKey = $"queue-spec-{Guid.NewGuid():N}",
		};
		db.Publication.Add(publication);
		await db.SaveChangesAsync();
		return publication.GetRequiredId();
	}

	[Fact]
	public async Task ItShouldReturnOnlyTheCallingTenantsNonTerminalRowsForTheAccount() {
		using var db = await _NewDbAsync();
		var (tenantA, accountA, userA) = await _SeedTenantAndAccountAsync(db);
		var (tenantB, accountB, userB) = await _SeedTenantAndAccountAsync(db);
		var scheduledId = await _SeedPublicationAsync(
			db, tenantA, accountA, userA,
			PublicationStatus.Scheduled, DateTime.UtcNow.AddHours(2)
		);
		var pausedId = await _SeedPublicationAsync(
			db, tenantA, accountA, userA,
			PublicationStatus.Paused, DateTime.UtcNow.AddHours(-1)
		);
		await _SeedPublicationAsync(
			db, tenantB, accountB, userB,
			PublicationStatus.Scheduled, DateTime.UtcNow.AddHours(2)
		);

		var service = _NewService(db);
		var rows = await service.FindNonTerminalForAccountAsync(
			new FindPublicationsOfAccountArgs(tenantA, accountA),
			CancellationToken.None
		);

		rows.Select(row => row.Id).Should().BeEquivalentTo([scheduledId, pausedId]);
	}

	[Fact]
	public async Task ItShouldExcludePublishedAndFailedRows() {
		using var db = await _NewDbAsync();
		var (tenantId, accountId, userId) = await _SeedTenantAndAccountAsync(db);
		var scheduledId = await _SeedPublicationAsync(
			db, tenantId, accountId, userId,
			PublicationStatus.Scheduled, DateTime.UtcNow.AddHours(2)
		);
		var pausedId = await _SeedPublicationAsync(
			db, tenantId, accountId, userId,
			PublicationStatus.Paused, DateTime.UtcNow.AddHours(-1)
		);
		await _SeedPublicationAsync(
			db, tenantId, accountId, userId,
			PublicationStatus.Published, DateTime.UtcNow.AddHours(-2)
		);
		await _SeedPublicationAsync(
			db, tenantId, accountId, userId,
			PublicationStatus.Failed, DateTime.UtcNow.AddHours(-3)
		);

		var service = _NewService(db);
		var rows = await service.FindNonTerminalForAccountAsync(
			new FindPublicationsOfAccountArgs(tenantId, accountId),
			CancellationToken.None
		);

		rows.Select(row => row.Id).Should().BeEquivalentTo([scheduledId, pausedId]);
	}

	[Fact]
	public async Task ItShouldReturnAnEmptyListWhenTheAccountHasNoQueuedRows() {
		using var db = await _NewDbAsync();
		var (tenantId, accountId, userId) = await _SeedTenantAndAccountAsync(db);
		await _SeedPublicationAsync(
			db, tenantId, accountId, userId,
			PublicationStatus.Published, DateTime.UtcNow.AddHours(-1)
		);

		var service = _NewService(db);
		var rows = await service.FindNonTerminalForAccountAsync(
			new FindPublicationsOfAccountArgs(tenantId, Guid.NewGuid()),
			CancellationToken.None
		);

		rows.Should().BeEmpty();
	}

	[Fact]
	public async Task ItShouldHideRowsWhenQueriedFromAnotherTenant() {
		using var db = await _NewDbAsync();
		var (tenantA, accountA, userA) = await _SeedTenantAndAccountAsync(db);
		var (tenantB, _, _) = await _SeedTenantAndAccountAsync(db);
		await _SeedPublicationAsync(
			db, tenantA, accountA, userA,
			PublicationStatus.Scheduled, DateTime.UtcNow.AddHours(2)
		);

		var service = _NewService(db);
		var rows = await service.FindNonTerminalForAccountAsync(
			new FindPublicationsOfAccountArgs(tenantB, accountA),
			CancellationToken.None
		);

		rows.Should().BeEmpty("a foreign tenant must never see another tenant's queue");
	}
}
