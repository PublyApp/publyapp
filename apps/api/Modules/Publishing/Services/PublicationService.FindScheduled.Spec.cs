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
// (real ephemeral Postgres, no HTTP surface). Pins the contract at the service
// boundary:
//
//   - The FromUtc bound is absolute unless the caller explicitly opts into the
//     InProgress/Paused carryover by including those statuses in `Statuses`.
//     The calendar sends no filter (strict window), the queue sends
//     scheduled,in_progress,paused (keep carryover until the worker is done or
//     the account reconnects).
//   - The cursor anchor is matched on the STORED ScheduledAtUtc and is not
//     re-evaluated against the mutable status filter: an anchor that
//     transitioned between pages must remain a usable cursor.
//   - A forged timestamp, a cross-tenant id, and a real out-of-window cursor
//     still surface as CursorNotFound.
//
// The context is built WITHOUT the tenant model filter, so these cases
// exercise the code's OWN tenant predicates and cannot be masked by
// first-tenant model caching.
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

	[Fact]
	public async Task ItShouldExcludeOldPausedRowsWhenNoStatusFilterIsSent() {
		await using var db = await NewDbAsync();
		var (tenantId, accountId, userId) = await SeedTenantAndAccountAsync(db);
		// Carryover is opt-in: a Paused row scheduled months before FromUtc must
		// NOT bleed into a window that did not ask for it. The calendar sends no
		// filter, so its view stays strict.
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
		page.Data.Should().BeEmpty();
	}

	[Fact]
	public async Task ItShouldExcludeOldInProgressRowsWhenNoStatusFilterIsSent() {
		await using var db = await NewDbAsync();
		var (tenantId, accountId, userId) = await SeedTenantAndAccountAsync(db);
		// Same carryover rule: the InProgress row is not opted in when the
		// caller sends no status filter, so it stays out of the strict window.
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
		page.Data.Should().BeEmpty();
	}

	[Fact]
	public async Task ItShouldKeepCarryoverInProgressRowsWhenStatusFilterIncludesThem() {
		await using var db = await NewDbAsync();
		var (tenantId, accountId, userId) = await SeedTenantAndAccountAsync(db);
		// The queue filter asks for in_progress; carryover must therefore apply
		// and the row the worker has not finished yet must stay visible past
		// FromUtc.
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
				Statuses: [
					PublicationStatus.Scheduled,
					PublicationStatus.InProgress,
					PublicationStatus.Paused,
				],
				Cursor: null,
				Limit: 50
			)
		);

		result.Should().BeOfType<FindScheduledResult.Success>();
		var page = ((FindScheduledResult.Success)result).Page;
		page.Data.Should().HaveCount(1);
		page.Data[0].Status.Should().Be("in_progress");
	}

	[Fact]
	public async Task ItShouldKeepCarryoverPausedRowsWhenStatusFilterIncludesThem() {
		await using var db = await NewDbAsync();
		var (tenantId, accountId, userId) = await SeedTenantAndAccountAsync(db);
		// Mirror of the InProgress case: Paused carryover requires the caller to
		// include Paused in `Statuses`. The queue filter does; the calendar
		// does not.
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
				Statuses: [
					PublicationStatus.Scheduled,
					PublicationStatus.InProgress,
					PublicationStatus.Paused,
				],
				Cursor: null,
				Limit: 50
			)
		);

		result.Should().BeOfType<FindScheduledResult.Success>();
		var page = ((FindScheduledResult.Success)result).Page;
		page.Data.Should().HaveCount(1);
		page.Data[0].Status.Should().Be("paused");
	}

	[Fact]
	public async Task ItShouldExcludeCarryoverInProgressRowsWhenStatusFilterOmitsThem() {
		await using var db = await NewDbAsync();
		var (tenantId, accountId, userId) = await SeedTenantAndAccountAsync(db);
		// Opt-out path: a caller that filters on Scheduled only must NOT receive
		// old InProgress rows even though they are temporally before FromUtc.
		// The carryover branch is gated on the filter, not on the row's status.
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
				Statuses: [PublicationStatus.Scheduled],
				Cursor: null,
				Limit: 50
			)
		);

		result.Should().BeOfType<FindScheduledResult.Success>();
		var page = ((FindScheduledResult.Success)result).Page;
		page.Data.Should().BeEmpty();
	}

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

	[Fact]
	public async Task ItShouldKeepACursorUsableWhenTheAnchorTransitionsBetweenPages() {
		await using var db = await NewDbAsync();
		var (tenantId, accountId, userId) = await SeedTenantAndAccountAsync(db);

		// Anchor row sits BEFORE the window's FromUtc and starts as InProgress
		// (the worker has claimed it but not finished yet — this is the only
		// case where a row scheduled earlier than the window still legitimately
		// belongs to the page: the queue filter asked for InProgress, so the
		// pre-window carryover is on). With Limit=1, page 1 returns the
		// anchor and the NextCursor encodes (its ScheduledAtUtc, its Id).
		// That row IS the cursor anchor for page 2.
		var anchorRow = await SeedPublicationAsync(
			db, tenantId, accountId, userId,
			new DateTime(2099, 12, 25, 10, 0, 0, DateTimeKind.Utc),
			seedStatus: PublicationStatus.InProgress
		);
		var followUpRow = await SeedPublicationAsync(
			db, tenantId, accountId, userId,
			new DateTime(2100, 1, 20, 10, 0, 0, DateTimeKind.Utc),
			seedStatus: PublicationStatus.Scheduled
		);
		var service = NewService(db);

		var statuses = new List<PublicationStatus> {
			PublicationStatus.Scheduled,
			PublicationStatus.InProgress,
			PublicationStatus.Paused,
		};

		var page1 = await service.FindScheduledAsync(
			new FindScheduledPublicationsArgs(
				TenantId: tenantId,
				FromUtc: new DateTime(2100, 1, 1, 0, 0, 0, DateTimeKind.Utc),
				ToUtc: new DateTime(2100, 2, 1, 0, 0, 0, DateTimeKind.Utc),
				Statuses: statuses,
				Cursor: null,
				Limit: 1
			)
		);
		var firstPage = ((FindScheduledResult.Success)page1).Page;
		firstPage.Data.Should().HaveCount(1);
		firstPage.Data[0].PublicationId.Should().Be(anchorRow.GetRequiredId());
		firstPage.NextCursor.Should().NotBeNullOrEmpty();

		// Between pages 1 and 2 the worker finishes the anchor: InProgress →
		// Published via the single legal writer of Status (#1446). The anchor's
		// ScheduledAtUtc and Id are unchanged; only Status moves out of the
		// requested filter AND out of the InProgress/Paused set, so the
		// previous (status-checked) FromUtc gate would have rejected the
		// cursor as CursorNotFound.
		var transitions = new PublicationStatusTransitionService(db);
		await transitions.MarkPublishedAsync(
			new MarkPublicationPublishedArgs(
				anchorRow.GetRequiredId(),
				tenantId,
				ExternalRecordId: "at://did:plc:test/app.bsky.feed.post/test",
				ExternalUrl: "https://bsky.app/profile/test/post/test"
			),
			CancellationToken.None
		);

		// Page 2 with the SAME cursor. The cursor probe must keep the anchor
		// valid: re-applying the FromUtc gate (or the Statuses filter) on the
		// anchor itself would re-break the cursor as soon as the worker
		// mutates the anchor's status out of InProgress/Paused. The keyset
		// filter that follows only relies on (ScheduledAtUtc, Id), so the
		// anchor's mutated status is irrelevant.
		var page2 = await service.FindScheduledAsync(
			new FindScheduledPublicationsArgs(
				TenantId: tenantId,
				FromUtc: new DateTime(2100, 1, 1, 0, 0, 0, DateTimeKind.Utc),
				ToUtc: new DateTime(2100, 2, 1, 0, 0, 0, DateTimeKind.Utc),
				Statuses: statuses,
				Cursor: firstPage.NextCursor,
				Limit: 1
			)
		);

		var secondPage = ((FindScheduledResult.Success)page2).Page;
		secondPage.Data.Should().HaveCount(1);
		secondPage.Data[0].PublicationId.Should().Be(followUpRow.GetRequiredId());
	}
}
