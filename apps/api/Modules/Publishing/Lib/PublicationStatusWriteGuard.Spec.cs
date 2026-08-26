using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Services;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Lib;

// Runtime containment for the Publication.Status single-writer guard (#1446,
// D1 follow-up): the Roslyn semantic walk (PublicationArchitectureSpec) cannot
// see a reflection writer or SQL assembled from pieces, so the DbContext itself
// refuses any tracked Status modification that the transition service did not
// stamp. Direct-invocation integration spec: real ephemeral Postgres, real
// DbContext, no HTTP surface.
public sealed class PublicationStatusWriteGuardSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public PublicationStatusWriteGuardSpec(ApiFixture fixture) {
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

	private static async Task<Publication> SeedScheduledPublicationAsync(
		AppDbContext db
	) {
		var tenant = new PublyApp.Api.Modules.Tenants.Entities.Tenant {
			Name = $"pub-status-guard-{Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = PublyApp.Api.Modules.Tenants.Entities.TenantStatus.Active,
			MaxUsers = 10,
		};
		var user = new User {
			Email = $"pub-status-guard-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true,
		};
		db.Tenant.Add(tenant);
		db.User.Add(user);
		await db.SaveChangesAsync();

		var post = new Post {
			TenantId = tenant.GetRequiredId(),
			Body = "status guard seed",
			CreatedByUserId = user.GetRequiredId(),
		};
		var account = new SocialAccount {
			TenantId = tenant.GetRequiredId(),
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@statusguard.bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		db.Post.Add(post);
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();

		var publication = new Publication {
			TenantId = tenant.GetRequiredId(),
			PostId = post.GetRequiredId(),
			SocialAccountId = account.GetRequiredId(),
			Status = PublicationStatus.Scheduled,
			ScheduledAtUtc = DateTime.UtcNow.AddHours(1),
			ScheduledTimeZone = "Etc/UTC",
			IdempotencyKey = $"status-guard-{Guid.NewGuid():N}",
		};
		db.Publication.Add(publication);
		await db.SaveChangesAsync();
		return publication;
	}

	[Fact]
	public async Task ItShouldRejectAReflectionStatusWriteAtSaveTime() {
		using var db = await NewDbAsync();
		var seeded = await SeedScheduledPublicationAsync(db);

		// The evasion shape the Roslyn scan can never see: the property is
		// reached by name at runtime, so no symbolic scan attributes this write.
		var statusProperty = typeof(Publication).GetProperty(nameof(Publication.Status));
		if (statusProperty is null) {
			throw new InvalidOperationException("Publication.Status property not found.");
		}

		statusProperty.SetValue(seeded, PublicationStatus.Published);
		db.Entry(seeded).State = EntityState.Modified;

		var act = async () => await db.SaveChangesAsync();

		var id = seeded.GetRequiredId();
		(await act.Should().ThrowAsync<PublicationStatusGuardException>())
			.Which.Message.Should().Contain(id.ToString())
			.And.Contain($"{PublicationStatus.Scheduled}")
			.And.Contain($"{PublicationStatus.Published}")
			.And.Contain("not written through the transition service");

		// Nothing leaked: the row still carries its old status on disk.
		await db.Entry(seeded).ReloadAsync();
		seeded.Status.Should().Be(PublicationStatus.Scheduled);
	}

	[Fact]
	public async Task ItShouldRejectAnUnstampedTrackedStatusChangeEvenWithoutReflection() {
		// A plain property assignment from non-service code is the same crime:
		// only the transition service's stamp legalises a Status write.
		using var db = await NewDbAsync();
		var seeded = await SeedScheduledPublicationAsync(db);

		seeded.Status = PublicationStatus.Failed;
		seeded.LastError = "unstamped direct write";

		var act = async () => await db.SaveChangesAsync();
		var id = seeded.GetRequiredId();
		(await act.Should().ThrowAsync<PublicationStatusGuardException>())
			.Which.Message.Should().Contain(id.ToString());
	}

	[Fact]
	public async Task ItShouldLetTheTransitionServiceStillSave() {
		using var db = await NewDbAsync();
		var seeded = await SeedScheduledPublicationAsync(db);
		var service = new PublicationStatusTransitionService(db);

		var moved = await service.MarkInProgressAsync(
			new MarkPublicationInProgressArgs(seeded.GetRequiredId(), seeded.TenantId),
			CancellationToken.None
		);

		moved.Should().BeTrue();
		await db.Entry(seeded).ReloadAsync();
		seeded.Status.Should().Be(PublicationStatus.InProgress);
	}

	[Fact]
	public async Task ItShouldLetOtherPropertiesChangeWithoutTheStamp() {
		// The guard pins ONLY Status: schedule edits and cause writes stay free
		// for every caller.
		using var db = await NewDbAsync();
		var seeded = await SeedScheduledPublicationAsync(db);

		seeded.ScheduledAtUtc = DateTime.UtcNow.AddHours(3);

		var act = async () => await db.SaveChangesAsync();
		await act.Should().NotThrowAsync();
	}

	[Fact]
	public async Task ItShouldLetAnEfGeneratedUpdateForAnotherTableSaveUnstamped() {
		// False-positive control on the tracked path demanded by the r2 brief:
		// flip ANOTHER entity's own status column so EF renders an UPDATE whose
		// SET list literally carries "status"; the guard must keep pinning ONLY
		// Publication.Status. A regression here locks editors out of unrelated
		// tables.
		using var db = await NewDbAsync();
		var seeded = await SeedScheduledPublicationAsync(db);
		var post = await db.Post.SingleAsync(p => p.Id == seeded.PostId);

		post.Status = PostStatus.Scheduled;
		post.Body = "unrelated edit beside a scheduled publication";

		var act = async () => await db.SaveChangesAsync();
		await act.Should().NotThrowAsync();

		await db.Entry(seeded).ReloadAsync();
		seeded.Status.Should().Be(PublicationStatus.Scheduled);
	}

	[Fact]
	public async Task ItShouldRejectAPlainRawSqlStatusUpdateOnAnUnstampedContext() {
		// Control for the CTE case below: proves ExecuteSqlRawAsync really
		// drives the command interceptor end-to-end on the live Npgsql
		// provider (real raw SQL, not a synthetic string fed to the regex).
		// Must stay GREEN after the r2 fix.
		using var db = await NewDbAsync();
		var seeded = await SeedScheduledPublicationAsync(db);
		var id = seeded.GetRequiredId();

		var act = async () => await db.Database.ExecuteSqlRawAsync(
			"UPDATE publications SET status = 20 WHERE id = {0}",
			id
		);

		(await act.Should().ThrowAsync<PublicationStatusGuardException>())
			.Which.Message.Should()
			.Contain("not written through the transition service");

		// Nothing leaked: the row still carries its old status on disk.
		await db.Entry(seeded).ReloadAsync();
		seeded.Status.Should().Be(PublicationStatus.Scheduled);
	}

	[Fact]
	public async Task ItShouldRejectACteWrappedRawSqlStatusUpdateOnAnUnstampedContext() {
		// RED before the r2 fix: the round-1 regex anchored UPDATE at
		// start-of-text, so a statement led by a WITH clause sailed past
		// CommandCreated and executed for real against Postgres.
		using var db = await NewDbAsync();
		var seeded = await SeedScheduledPublicationAsync(db);
		var id = seeded.GetRequiredId();

		var act = async () => await db.Database.ExecuteSqlRawAsync(
			"WITH cte AS (SELECT 1) UPDATE publications SET status = 20 WHERE id = {0}",
			id
		);

		(await act.Should().ThrowAsync<PublicationStatusGuardException>())
			.Which.Message.Should()
			.Contain("not written through the transition service");

		await db.Entry(seeded).ReloadAsync();
		seeded.Status.Should().Be(PublicationStatus.Scheduled);
	}

	[Fact]
	public async Task ItShouldRejectALeadingCommentHiddenRawSqlStatusUpdate() {
		// Second pinned evasion shape from the r1 review: a leading block
		// comment defeats a start-of-text anchor just as well as a CTE does.
		using var db = await NewDbAsync();
		var seeded = await SeedScheduledPublicationAsync(db);
		var id = seeded.GetRequiredId();

		var act = async () => await db.Database.ExecuteSqlRawAsync(
			"/* ops backfill, do not touch */ UPDATE publications "
				+ "SET status = 20 WHERE id = {0}",
			id
		);

		(await act.Should().ThrowAsync<PublicationStatusGuardException>())
			.Which.Message.Should()
			.Contain("not written through the transition service");

		await db.Entry(seeded).ReloadAsync();
		seeded.Status.Should().Be(PublicationStatus.Scheduled);
	}

	[Fact]
	public async Task ItShouldRejectALowercaseWherelessCteStatusUpdate() {
		// Mutation-killer, not just another shape: no WHERE/FROM/RETURNING
		// bounds the SET list (so reverting the end-of-text terminator alone
		// turns this RED) and every keyword is lowercase (so dropping
		// RegexOptions.IgnoreCase turns this RED too). Pre-fix this executed
		// for real and flipped every row in the class database.
		using var db = await NewDbAsync();
		await SeedScheduledPublicationAsync(db);

		var act = async () => await db.Database.ExecuteSqlRawAsync(
			"with cte as (select 1) update publications set status = 20"
		);

		(await act.Should().ThrowAsync<PublicationStatusGuardException>())
			.Which.Message.Should()
			.Contain("not written through the transition service");

		var rows = await db.Publication.ToListAsync();
		rows.Should().Contain(p => p.Status == PublicationStatus.Scheduled,
			"an unstamped bulk status update must be refused before execution");
	}

	[Fact]
	public async Task ItShouldRejectAStatusUpdateHiddenAsTheSecondBatchedStatement() {
		// Mutation-killer: matching the whole text with a single unanchored Match
		// instead of splitting on ';' stays green on every statement-level case
		// yet lets the SECOND batched statement commit the crime.
		using var db = await NewDbAsync();
		var seeded = await SeedScheduledPublicationAsync(db);
		var id = seeded.GetRequiredId();

		var act = async () => await db.Database.ExecuteSqlRawAsync(
			"UPDATE posts SET body = 'unrelated' WHERE id = "
				+ "'00000000-0000-0000-0000-000000000000'; "
				+ "UPDATE publications SET status = 20 WHERE id = {0}",
			id
		);

		(await act.Should().ThrowAsync<PublicationStatusGuardException>())
			.Which.Message.Should()
			.Contain("not written through the transition service");

		await db.Entry(seeded).ReloadAsync();
		seeded.Status.Should().Be(PublicationStatus.Scheduled);
	}

	[Fact]
	public async Task ItShouldRejectAMultilineVerbatimCteStatusUpdate() {
		// Mutation-killer: dropping RegexOptions.Singleline keeps every one-line
		// case green but re-opens the shape developers actually write — a
		// multi-line verbatim CTE whose SET list ends past a newline.
		using var db = await NewDbAsync();
		await SeedScheduledPublicationAsync(db);

		var act = async () => await db.Database.ExecuteSqlRawAsync(
			"""
			WITH due AS (
			  SELECT id FROM publications
			)
			UPDATE publications
			SET status = 20
			WHERE id IN (SELECT id FROM due)
			"""
		);

		(await act.Should().ThrowAsync<PublicationStatusGuardException>())
			.Which.Message.Should()
			.Contain("not written through the transition service");
	}

	[Fact]
	public async Task ItShouldRejectADataModifyingCteThatUpdatesPublicationsStatus() {
		// The subtlest r2 shape: the FIRST "UPDATE ... SET" in the text belongs
		// to an innocent data-modifying CTE over posts, and only its RETURNING
		// mentions publications. Matching just the first occurrence fails open
		// here; every UPDATE occurrence must be inspected.
		using var db = await NewDbAsync();
		var seeded = await SeedScheduledPublicationAsync(db);
		var id = seeded.GetRequiredId();

		var act = async () => await db.Database.ExecuteSqlRawAsync(
			"WITH bumped AS ("
				+ "UPDATE posts SET body = body WHERE id = '00000000-0000-0000-0000-000000000000' "
				+ "RETURNING id) "
				+ "UPDATE publications SET status = 20 WHERE id = {0}",
			id
		);

		(await act.Should().ThrowAsync<PublicationStatusGuardException>())
			.Which.Message.Should()
			.Contain("not written through the transition service");

		await db.Entry(seeded).ReloadAsync();
		seeded.Status.Should().Be(PublicationStatus.Scheduled);
	}

	[Fact]
	public async Task ItShouldLetABenignSelectSurviveEvenWhenACommentQuotesAStatusUpdate() {
		// False-positive control demanded by the r1 review: a comment QUOTING
		// an update is not an update. The unanchored matcher alone trips on
		// the quoted text; stripping comments before matching keeps this
		// benign command alive. Goes RED if the comment strip regresses.
		using var db = await NewDbAsync();

		var act = async () => await db.Database.ExecuteSqlRawAsync(
			"/* UPDATE publications SET status = 20 */ SELECT 1"
		);

		await act.Should().NotThrowAsync();
	}
}
