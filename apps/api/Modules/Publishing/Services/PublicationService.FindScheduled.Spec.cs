using System.Text;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Services;

// Direct-invocation integration spec for PublicationService.FindScheduledAsync
// (real ephemeral Postgres, no HTTP surface). Pins the round-3 fixes at the
// service boundary: an empty window is a normal empty page (not a crash), and
// the cursor-existence probe is tenant-scoped like the main query. The context
// is built WITHOUT the tenant model filter, so these cases exercise the code's
// OWN tenant predicates and cannot be masked by first-tenant model caching.
public sealed class PublicationServiceFindScheduledSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public PublicationServiceFindScheduledSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

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

	private static PublicationService NewService(AppDbContext db) {
		return new PublicationService(db, new Microsoft.AspNetCore.Http.HttpContextAccessor());
	}

	private static async Task<(Guid TenantId, Guid AccountId, Guid UserId)>
		SeedTenantAndAccountAsync(AppDbContext db) {
		var tenant = new Tenant {
			Name = $"pub-find-{Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		var user = new User {
			Email = $"pub-find-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true,
		};
		db.Tenant.Add(tenant);
		db.User.Add(user);
		await db.SaveChangesAsync();

		var account = new SocialAccount {
			TenantId = tenant.GetRequiredId(),
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@findspec.bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();

		return (tenant.GetRequiredId(), account.GetRequiredId(), user.GetRequiredId());
	}

	private static async Task<Publication> SeedPublicationAsync(
		AppDbContext db,
		Guid tenantId,
		Guid accountId,
		Guid userId,
		DateTime scheduledAtUtc,
		PublicationStatus seedStatus = PublicationStatus.Scheduled
	) {
		var post = new Post {
			TenantId = tenantId,
			Body = "find service spec body",
			CreatedByUserId = userId,
		};
		db.Post.Add(post);
		await db.SaveChangesAsync();

		var publication = new Publication {
			TenantId = tenantId,
			PostId = post.GetRequiredId(),
			SocialAccountId = accountId,
			Status = seedStatus,
			ScheduledAtUtc = scheduledAtUtc,
			ScheduledTimeZone = "Europe/Paris",
			IdempotencyKey = $"find-service-spec-{Guid.NewGuid():N}",
		};
		db.Publication.Add(publication);
		await db.SaveChangesAsync();
		return publication;
	}

	private static string EncodeCursor(DateTime utcInstant, Guid id) {
		return Convert.ToBase64String(
			Encoding.UTF8.GetBytes($"{utcInstant:O}|{id}")
		);
	}

	// #2053 — an InProgress row whose ScheduledAtUtc is BEFORE the window's
	// FromUtc must still appear in the page. The Queue shows work the worker
	// has not yet finished; the time bound only filters rows whose schedule
	// the user has not seen (Scheduled is bounded on both sides because the
	// queue is a forward-looking calendar). Status filter omitted to mirror
	// the calendar view (the worker fetches InProgress + Scheduled + Paused).
	[Fact]
	public async Task ItShouldIncludeInProgressRowsEvenWhenScheduledAtUtcIsBeforeFromUtc() {
		await using var db = await NewDbAsync();
		var (tenantId, accountId, userId) = await SeedTenantAndAccountAsync(db);
		_ = await SeedPublicationAsync(
			db, tenantId, accountId, userId,
			new DateTime(2099, 6, 1, 10, 0, 0, DateTimeKind.Utc),
			seedStatus: PublicationStatus.InProgress
		);
		var service = NewService(db);

		var result = await service.FindScheduledAsync(
			new FindScheduledPublicationsArgs(
				TenantId: tenantId,
				FromUtc: new DateTime(2100, 1, 1, 0, 0, 0, DateTimeKind.Utc),
				ToUtc: new DateTime(2100, 1, 31, 0, 0, 0, DateTimeKind.Utc),
				Statuses: null,
				Cursor: null,
				Limit: 50
			)
		);

		result.Should().BeOfType<FindScheduledResult.Success>();
		var page = ((FindScheduledResult.Success)result).Page;
		page.Data.Should().HaveCount(1);
		page.Data[0].Status.Should().Be("in_progress");
	}

	// #2053 — same as above for Paused (Epic C reconnect path: a paused row
	// keeps its old ScheduledAtUtc; the queue must keep showing it until the
	// account is reconnected, even after the schedule instant has passed).
	[Fact]
	public async Task ItShouldIncludePausedRowsEvenWhenScheduledAtUtcIsBeforeFromUtc() {
		await using var db = await NewDbAsync();
		var (tenantId, accountId, userId) = await SeedTenantAndAccountAsync(db);
		_ = await SeedPublicationAsync(
			db, tenantId, accountId, userId,
			new DateTime(2099, 6, 1, 10, 0, 0, DateTimeKind.Utc),
			seedStatus: PublicationStatus.Paused
		);
		var service = NewService(db);

		var result = await service.FindScheduledAsync(
			new FindScheduledPublicationsArgs(
				TenantId: tenantId,
				FromUtc: new DateTime(2100, 1, 1, 0, 0, 0, DateTimeKind.Utc),
				ToUtc: new DateTime(2100, 1, 31, 0, 0, 0, DateTimeKind.Utc),
				Statuses: null,
				Cursor: null,
				Limit: 50
			)
		);

		result.Should().BeOfType<FindScheduledResult.Success>();
		var page = ((FindScheduledResult.Success)result).Page;
		page.Data.Should().HaveCount(1);
		page.Data[0].Status.Should().Be("paused");
	}

	// #2053 — Scheduled rows remain bounded on both sides (control: the queue
	// is a forward-looking calendar; a past Scheduled row is a stale row that
	// the worker did not pick up and must not flood the page).
	[Fact]
	public async Task ItShouldExcludeScheduledRowsWhenScheduledAtUtcIsBeforeFromUtc() {
		await using var db = await NewDbAsync();
		var (tenantId, accountId, userId) = await SeedTenantAndAccountAsync(db);
		_ = await SeedPublicationAsync(
			db, tenantId, accountId, userId,
			new DateTime(2099, 6, 1, 10, 0, 0, DateTimeKind.Utc),
			seedStatus: PublicationStatus.Scheduled
		);
		var service = NewService(db);

		var result = await service.FindScheduledAsync(
			new FindScheduledPublicationsArgs(
				TenantId: tenantId,
				FromUtc: new DateTime(2100, 1, 1, 0, 0, 0, DateTimeKind.Utc),
				ToUtc: new DateTime(2100, 1, 31, 0, 0, 0, DateTimeKind.Utc),
				Statuses: null,
				Cursor: null,
				Limit: 50
			)
		);

		result.Should().BeOfType<FindScheduledResult.Success>();
		var page = ((FindScheduledResult.Success)result).Page;
		page.Data.Should().BeEmpty();
	}

	// #2053 — a cursor that names a real publication id (the eligibility probe
	// finds the row by id alone) but FORGES the ScheduledAtUtc is rejected.
	// Loosening the window probe so the InProgress/Paused cursor rows stay
	// eligible opens the door to a forged timestamp scanning other rows of
	// the same tenant: the cursor must encode BOTH the id AND the exact
	// stored ScheduledAtUtc, otherwise an attacker (or a stale page) could
	// anchor a keyset page on a row that does not exist at the claimed
	// instant — a 400 CursorNotFound closes the door.
	[Fact]
	public async Task ItShouldRejectACursorWhoseForgedTimestampMismatchesTheStoredScheduledAtUtc() {
		await using var db = await NewDbAsync();
		var (tenantId, accountId, userId) = await SeedTenantAndAccountAsync(db);
		var eligibleRow = await SeedPublicationAsync(
			db, tenantId, accountId, userId,
			new DateTime(2099, 6, 1, 10, 0, 0, DateTimeKind.Utc),
			seedStatus: PublicationStatus.InProgress
		);
		var service = NewService(db);

		// The id matches the eligible row; the timestamp is FORGED to a
		// different instant than the row's stored ScheduledAtUtc. Without the
		// stored-ScheduledAtUtc equality check the probe accepts the id and
		// anchors the page on a phantom instant.
		var forgedInstant = new DateTime(2099, 6, 1, 9, 0, 0, DateTimeKind.Utc);
		var result = await service.FindScheduledAsync(
			new FindScheduledPublicationsArgs(
				TenantId: tenantId,
				FromUtc: new DateTime(2099, 6, 1, 0, 0, 0, DateTimeKind.Utc),
				ToUtc: new DateTime(2099, 7, 1, 0, 0, 0, DateTimeKind.Utc),
				Statuses: null,
				Cursor: EncodeCursor(forgedInstant, eligibleRow.GetRequiredId()),
				Limit: 50
			)
		);

		result.Should().BeOfType<FindScheduledResult.CursorNotFound>();
	}

	[Fact]
	public async Task ItShouldReturnAnEmptyPageWhenTheWindowMatchesNoRows() {
		await using var db = await NewDbAsync();
		var (tenantA, accountA, userA) = await SeedTenantAndAccountAsync(db);
		_ = await SeedPublicationAsync(
			db, tenantA, accountA, userA,
			new DateTime(2099, 6, 1, 10, 0, 0, DateTimeKind.Utc)
		);
		var service = NewService(db);

		// Round-2 finding: rows[^1] was read unconditionally, so a window with no
		// matching row crashed with 500. The service must answer a coherent empty
		// page with no next cursor.
		var result = await service.FindScheduledAsync(
			new FindScheduledPublicationsArgs(
				TenantId: tenantA,
				FromUtc: new DateTime(2100, 3, 1, 0, 0, 0, DateTimeKind.Utc),
				ToUtc: new DateTime(2100, 3, 31, 0, 0, 0, DateTimeKind.Utc),
				Statuses: null,
				Cursor: null,
				Limit: 50
			)
		);

		result.Should().BeOfType<FindScheduledResult.Success>();
		var page = ((FindScheduledResult.Success)result).Page;
		page.Data.Should().BeEmpty();
		page.NextCursor.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldRejectACursorThatRefersToAnotherTenantsPublication() {
		await using var db = await NewDbAsync();
		var (tenantA, accountA, userA) = await SeedTenantAndAccountAsync(db);
		var (tenantB, accountB, userB) = await SeedTenantAndAccountAsync(db);
		var foreignRow = await SeedPublicationAsync(
			db, tenantA, accountA, userA,
			new DateTime(2100, 1, 15, 8, 0, 0, DateTimeKind.Utc)
		);
		var service = NewService(db);

		// Round-2 finding: the cursor-existence probe was not tenant-scoped while
		// the main query was. A cursor anchored on tenant A's row must not anchor
		// tenant B's page: B answers CursorNotFound (400), not a page built from
		// nothing.
		var result = await service.FindScheduledAsync(
			new FindScheduledPublicationsArgs(
				TenantId: tenantB,
				FromUtc: new DateTime(2100, 1, 1, 0, 0, 0, DateTimeKind.Utc),
				ToUtc: new DateTime(2100, 2, 1, 0, 0, 0, DateTimeKind.Utc),
				Statuses: null,
				Cursor: EncodeCursor(
					foreignRow.ScheduledAtUtc,
					foreignRow.GetRequiredId()
				),
				Limit: 50
			)
		);

		result.Should().BeOfType<FindScheduledResult.CursorNotFound>();
	}
}
