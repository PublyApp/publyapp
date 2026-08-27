using System.Globalization;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Jobs;
using PublyApp.Api.Modules.Publishing.Lib;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Services;

// Direct-invocation integration spec: real ephemeral Postgres, real DbContext,
// no HTTP surface — the endpoint arrives in D2 Task 2 and orchestrates THIS service.
// Bluesky is never touched here: the service stops at the trusted enqueue boundary.
public sealed class PublishNowServiceSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public PublishNowServiceSpec(ApiFixture fixture) {
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

	private static async Task<(Guid TenantId, Guid ActorUserId)> SeedTenantAsync(
		AppDbContext db
	) {
		var tenant = new PublyApp.Api.Modules.Tenants.Entities.Tenant {
			Name = $"pub-now-{Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = PublyApp.Api.Modules.Tenants.Entities.TenantStatus.Active,
			MaxUsers = 10,
		};
		var user = new User {
			Email = $"pub-now-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true,
		};
		db.Tenant.Add(tenant);
		db.User.Add(user);
		await db.SaveChangesAsync();
		return (tenant.GetRequiredId(), user.GetRequiredId());
	}

	private static async Task<Guid> SeedPostAsync(
		AppDbContext db,
		Guid tenantId,
		Guid createdByUserId
	) {
		var post = new Post {
			TenantId = tenantId,
			Body = "hello from the publish-now spec",
			CreatedByUserId = createdByUserId,
		};
		db.Post.Add(post);
		await db.SaveChangesAsync();
		return post.GetRequiredId();
	}

	private static async Task<Guid> SeedAccountAsync(AppDbContext db, Guid tenantId) {
		var account = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@publish-now.bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();
		return account.GetRequiredId();
	}

	private static PublishNowService NewService(
		AppDbContext db,
		Guid tenantId,
		Guid actorUserId
	) {
		var enqueuer = new JobEnqueuer(
			db,
			new RequestAuthContext {
				SessionToken = "spec-session",
				UserId = actorUserId,
				TenantId = tenantId.ToString(),
			}
		);
		return new PublishNowService(db, enqueuer);
	}

	private static async Task<List<JobQueueItem>> JobRowsAsync(
		AppDbContext db,
		Guid tenantId
	) {
		return await db.JobQueue
			.Where(job => job.JobType == PublishingJobs.PublishPublicationV1JobType
				&& job.TenantId == tenantId)
			.ToListAsync(CancellationToken.None);
	}

	private static async Task<List<Publication>> RowsForPostAsync(
		AppDbContext db,
		Guid tenantId,
		Guid postId
	) {
		return await db.Publication
			.Where(p => p.TenantId == tenantId && p.PostId == postId)
			.ToListAsync();
	}

	private static async Task<int> TotalPublicationsAsync(AppDbContext db) {
		return await db.Publication.CountAsync();
	}

	[Fact]
	public async Task ItShouldTreatATerminalFailedRowAsNotLiveSoThePairIsReissuable() {
		// Round-2 MEDIUM fix: a FAILED publication must not lock the (post, account)
		// pair forever. The live check and the partial unique index both exclude
		// terminal Failed rows, so re-issuing publish-now starts a FRESH attempt
		// while the failed row stays as history.
		using var db = await NewDbAsync();
		var (tenantId, actorUserId) = await SeedTenantAsync(db);
		var postId = await SeedPostAsync(db, tenantId, actorUserId);
		var accountA = await SeedAccountAsync(db, tenantId);
		var service = NewService(db, tenantId, actorUserId);

		var first = await service.PublishNowAsync(
			new PublishNowArgs(tenantId, postId, actorUserId, [accountA]),
			CancellationToken.None
		);
		first.Should().BeOfType<PublishNowResult.Created>();

		// Terminal failure through the ONLY legal status writer, mirroring the real
		// delivery path: a row is InProgress while delivery runs, then Fails.
		// MarkFailedAsync only accepts InProgress as a source, by design.
		var publication = await db.Publication.SingleAsync(
			p => p.PostId == postId && p.SocialAccountId == accountA
		);
		var transitions = new PublicationStatusTransitionService(db);
		(await transitions.MarkInProgressAsync(
			new MarkPublicationInProgressArgs(publication.GetRequiredId(), tenantId),
			CancellationToken.None
		)).Should().BeTrue();
		(await transitions.MarkFailedAsync(
			new MarkPublicationFailedArgs(
				publication.GetRequiredId(),
				tenantId,
				"spec: provider returned 500"
			),
			CancellationToken.None
		)).Should().BeTrue();

		var second = await service.PublishNowAsync(
			new PublishNowArgs(tenantId, postId, actorUserId, [accountA]),
			CancellationToken.None
		);
		var created = second.Should().BeOfType<PublishNowResult.Created>().Subject;
		created.PublicationIds.Should().HaveCount(1);

		// The failed row remains as history; the fresh attempt adds exactly one new row.
		var rows = await RowsForPostAsync(db, tenantId, postId);
		rows.Should().HaveCount(2, "the failed row stays as history beside the new attempt");
		rows.Count(p => p.Status == PublicationStatus.Failed).Should().Be(1);
		rows.Count(p => p.Status == PublicationStatus.Scheduled).Should().Be(1);

		var jobs = await JobRowsAsync(db, tenantId);
		jobs.Should().HaveCount(2, "the fresh attempt enqueues its own delivery job");
	}

	[Fact]
	public async Task ItShouldKeepAPublishedRowOccupyingThePairAgainstReissue() {
		// Published rows keep occupying the pair: the remote record exists and a
		// second delivery would double-post on the social network.
		using var db = await NewDbAsync();
		var (tenantId, actorUserId) = await SeedTenantAsync(db);
		var postId = await SeedPostAsync(db, tenantId, actorUserId);
		var accountA = await SeedAccountAsync(db, tenantId);
		var service = NewService(db, tenantId, actorUserId);

		var first = await service.PublishNowAsync(
			new PublishNowArgs(tenantId, postId, actorUserId, [accountA]),
			CancellationToken.None
		);
		first.Should().BeOfType<PublishNowResult.Created>();

		var publication = await db.Publication.SingleAsync(
			p => p.PostId == postId && p.SocialAccountId == accountA
		);
		var transitions = new PublicationStatusTransitionService(db);
		(await transitions.MarkInProgressAsync(
			new MarkPublicationInProgressArgs(publication.GetRequiredId(), tenantId),
			CancellationToken.None
		)).Should().BeTrue();
		(await transitions.MarkPublishedAsync(
			new MarkPublicationPublishedArgs(
				publication.GetRequiredId(),
				tenantId,
				"at://spec/record",
				"https://bsky.app/profile/spec/post/abc"
			),
			CancellationToken.None
		)).Should().BeTrue();

		var second = await service.PublishNowAsync(
			new PublishNowArgs(tenantId, postId, actorUserId, [accountA]),
			CancellationToken.None
		);
		second.Should().BeOfType<PublishNowResult.LivePublicationsExist>(
			"a published row is live for the pair: the post is already out"
		);
	}

	[Fact]
	public async Task ItShouldTranslateALostUniqueIndexRaceIntoLivePublicationsExist() {
		// Round-2 NOTE fix: the proactive check is query-then-act; two concurrent
		// publish-now calls can both pass it. The partial unique index
		// ux_publications_post_account is the authority - this spec pins that a lost
		// race surfaces as the SAME structured outcome as the proactive check
		// (LivePublicationsExist -> 422), never a raw DbUpdateException / 500.
		using var db = await NewDbAsync();
		var (tenantId, actorUserId) = await SeedTenantAsync(db);
		var postId = await SeedPostAsync(db, tenantId, actorUserId);
		var accountA = await SeedAccountAsync(db, tenantId);
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		// Real two-connection race: the rival parks an UNCOMMITTED insert on the
		// pair while the service passes its proactive check (the rival row is
		// invisible under READ COMMITTED), then blocks on the unique index until
		// the rival commits. The violation must surface structured.
		await using var rivalConnection = new Npgsql.NpgsqlConnection(connectionString);
		await rivalConnection.OpenAsync();
		await using var rivalTx = await rivalConnection.BeginTransactionAsync();
		var rivalOptions = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql(rivalConnection)
			.Options;
		await using (var rivalContext = new AppDbContext(rivalOptions)) {
			rivalContext.Database.UseTransaction(rivalTx);
			rivalContext.Publication.Add(new Publication {
				TenantId = tenantId,
				PostId = postId,
				SocialAccountId = accountA,
				ScheduledAtUtc = DateTime.UtcNow,
				ScheduledTimeZone = "Etc/UTC",
				IdempotencyKey = $"race-{Guid.NewGuid():N}",
			});
			await rivalContext.SaveChangesAsync();
		}

		var service = NewService(db, tenantId, actorUserId);
		var racedTask = service.PublishNowAsync(
			new PublishNowArgs(tenantId, postId, actorUserId, [accountA]),
			CancellationToken.None
		);

		// Wait until the service insert is genuinely parked on the rival
		// transaction before committing, so the 23505 path is deterministic.
		await using var watcherConnection = new Npgsql.NpgsqlConnection(connectionString);
		await watcherConnection.OpenAsync();
		var deadline = DateTime.UtcNow.AddSeconds(30);
		var sawBlockedBackend = false;
		while (DateTime.UtcNow < deadline) {
			await using var watchCommand = watcherConnection.CreateCommand();
			watchCommand.CommandText =
				"SELECT COUNT(*) FROM pg_stat_activity "
				+ "WHERE state = 'active' AND wait_event_type = 'Lock' "
				// Contended publications inserts only: a plain insert on an empty
				// table never parks, so parallel-suite cross-talk stays noise-free.
				+ "AND query ILIKE '%INSERT INTO publications%';";
			var parked = Convert.ToInt32(
				await watchCommand.ExecuteScalarAsync(),
				CultureInfo.InvariantCulture
			);
			if (parked > 0) {
				sawBlockedBackend = true;
				break;
			}
			await Task.Delay(100);
		}
		sawBlockedBackend.Should()
			.BeTrue("the service insert must block on the rival before the commit");

		await rivalTx.CommitAsync();
		var raced = await racedTask;

		raced.Should().BeOfType<PublishNowResult.LivePublicationsExist>(
			"the index is the authority when the proactive check races and loses"
		);
		var refusedIds = raced.Should()
			.BeOfType<PublishNowResult.LivePublicationsExist>().Subject;
		refusedIds.AccountIds.Should().BeEquivalentTo([accountA]);
	}

	[Fact]
	public async Task ItShouldCreateScheduledPublicationsWithDeterministicKeysAndOneJobEach() {
		using var db = await NewDbAsync();
		var (tenantId, actorUserId) = await SeedTenantAsync(db);
		var postId = await SeedPostAsync(db, tenantId, actorUserId);
		var accountA = await SeedAccountAsync(db, tenantId);
		var accountB = await SeedAccountAsync(db, tenantId);
		var service = NewService(db, tenantId, actorUserId);

		var beforeCount = await TotalPublicationsAsync(db);

		var result = await service.PublishNowAsync(
			new PublishNowArgs(tenantId, postId, actorUserId, [accountA, accountB]),
			CancellationToken.None
		);

		var created = result.Should().BeOfType<PublishNowResult.Created>().Subject;
		created.PublicationIds.Should().HaveCount(2);

		var publications = await RowsForPostAsync(db, tenantId, postId);
		publications.Should().HaveCount(2);
		(await TotalPublicationsAsync(db)).Should().Be(beforeCount + 2);

		foreach (var publication in publications) {
			publication.Status.Should().Be(
				PublicationStatus.Scheduled,
				"a fresh publish-now row is born scheduled"
			);
			publication.ScheduledAtUtc.Should().BeCloseTo(
				DateTime.UtcNow,
				TimeSpan.FromSeconds(5),
				"publish-now claims NOW as its instant"
			);
			publication.ScheduledTimeZone.Should().Be(TimeZoneInfo.Local.Id);
			publication.IdempotencyKey.Should().Be(
				PublicationIdempotencyKey.For(publication.GetRequiredId()),
				"the stored key derives deterministically from the true row id"
			);
		}

		created.PublicationIds.Should().BeEquivalentTo(
			publications.Select(p => p.GetRequiredId())
		);

		var jobs = await JobRowsAsync(db, tenantId);
		jobs.Should().HaveCount(2, "exactly one enqueue per publication");
		foreach (var job in jobs) {
			job.IdempotencyKey.Should().NotBeNull();
			using var payload = JsonDocument.Parse(job.Payload);
			var payloadPublicationId = Guid.Parse(
				payload.RootElement.GetProperty("publicationId").GetString()!
			);
			var payloadKey = payload.RootElement.GetProperty("idempotencyKey").GetString();
			payloadKey.Should().NotBeNull();
			payloadKey.Should().Be(
				PublicationIdempotencyKey.For(payloadPublicationId),
				"the payload carries the deterministic derivation"
			);

			var publication = publications.Single(p =>
				p.GetRequiredId() == payloadPublicationId
			);
			job.IdempotencyKey.Should().Be(
				publication.IdempotencyKey,
				"the enqueue dedup key equals the stored row key"
			);
		}
	}

	[Fact]
	public async Task ItShouldRefuseAnOverlappingLiveAccountButStillCreateTheRest() {
		using var db = await NewDbAsync();
		var (tenantId, actorUserId) = await SeedTenantAsync(db);
		var postId = await SeedPostAsync(db, tenantId, actorUserId);
		var accountA = await SeedAccountAsync(db, tenantId);
		var accountB = await SeedAccountAsync(db, tenantId);
		var service = NewService(db, tenantId, actorUserId);

		var first = await service.PublishNowAsync(
			new PublishNowArgs(tenantId, postId, actorUserId, [accountA, accountB]),
			CancellationToken.None
		);
		first.Should().BeOfType<PublishNowResult.Created>();

		var second = await service.PublishNowAsync(
			new PublishNowArgs(tenantId, postId, actorUserId, [accountB]),
			CancellationToken.None
		);

		var refused = second.Should().BeOfType<PublishNowResult.LivePublicationsExist>()
			.Subject;
		refused.AccountIds.Should().BeEquivalentTo([accountB]);

		var rows = await RowsForPostAsync(db, tenantId, postId);
		rows.Should().HaveCount(2, "the overlap adds no duplicate pair");
		rows.Count(p => p.SocialAccountId == accountB).Should().Be(1);

		var jobs = await JobRowsAsync(db, tenantId);
		jobs.Should().HaveCount(2, "no job is enqueued for the refused account");
	}

	[Fact]
	public async Task ItShouldTreatAPublishedRowAsLiveForThePair() {
		using var db = await NewDbAsync();
		var (tenantId, actorUserId) = await SeedTenantAsync(db);
		var postId = await SeedPostAsync(db, tenantId, actorUserId);
		var accountA = await SeedAccountAsync(db, tenantId);
		var service = NewService(db, tenantId, actorUserId);

		// Reach Published through the ONLY sanctioned writer chain: the transition
		// service. This spec never assigns Publication.Status directly.
		var first = await service.PublishNowAsync(
			new PublishNowArgs(tenantId, postId, actorUserId, [accountA]),
			CancellationToken.None
		);
		var created = first.Should().BeOfType<PublishNowResult.Created>().Subject;
		var transitions = new PublicationStatusTransitionService(db);
		await transitions.MarkInProgressAsync(
			new MarkPublicationInProgressArgs(created.PublicationIds[0], tenantId),
			CancellationToken.None
		);
		await transitions.MarkPublishedAsync(
			new MarkPublicationPublishedArgs(
				created.PublicationIds[0],
				tenantId,
				"at://did.example/app.bsky.feed.post/abc123",
				"https://bsky.app/profile/did.example/post/abc123"
			),
			CancellationToken.None
		);

		var republish = await service.PublishNowAsync(
			new PublishNowArgs(tenantId, postId, actorUserId, [accountA]),
			CancellationToken.None
		);

		republish.Should().BeOfType<PublishNowResult.LivePublicationsExist>(
			"a still-live published row occupies the (post, account) pair"
		);
		var rows = await RowsForPostAsync(db, tenantId, postId);
		rows.Should().ContainSingle("republishing a live pair creates nothing");
	}

	[Fact]
	public async Task ItShouldReturnPostNotFoundForAForeignTenantAndWriteNothing() {
		using var db = await NewDbAsync();
		var (tenantA, _) = await SeedTenantAsync(db);
		var (_, actorB) = await SeedTenantAsync(db);
		var foreignPostId = await SeedPostAsync(db, tenantA, actorB);
		var service = NewService(db, tenantA, actorB);

		var beforePublications = await TotalPublicationsAsync(db);
		var beforeJobs = await db.JobQueue.CountAsync();

		var result = await service.PublishNowAsync(
			new PublishNowArgs(actorB, foreignPostId, actorB, [Guid.CreateVersion7()]),
			CancellationToken.None
		);

		result.Should().BeOfType<PublishNowResult.PostNotFound>();
		(await TotalPublicationsAsync(db)).Should().Be(beforePublications);
		(await db.JobQueue.CountAsync()).Should().Be(beforeJobs);
	}

	[Fact]
	public async Task ItShouldListForeignAccountsAsNotFoundAndWriteNothing() {
		using var db = await NewDbAsync();
		var (tenantId, actorUserId) = await SeedTenantAsync(db);
		var (foreignTenant, _) = await SeedTenantAsync(db);
		var postId = await SeedPostAsync(db, tenantId, actorUserId);
		var known = await SeedAccountAsync(db, tenantId);
		var foreign = await SeedAccountAsync(db, foreignTenant);
		var service = NewService(db, tenantId, actorUserId);

		var beforePublications = await TotalPublicationsAsync(db);
		var beforeJobs = await JobRowsAsync(db, tenantId);

		var result = await service.PublishNowAsync(
			new PublishNowArgs(
				tenantId,
				postId,
				actorUserId,
				[known, foreign, Guid.CreateVersion7()]
			),
			CancellationToken.None
		);

		var notFound = result.Should().BeOfType<PublishNowResult.AccountsNotFound>()
			.Subject;
		notFound.AccountIds.Should().HaveCount(2);
		notFound.AccountIds.Should().Contain(foreign);
		notFound.AccountIds.Should().NotContain(known);

		(await TotalPublicationsAsync(db)).Should().Be(beforePublications);
		(await JobRowsAsync(db, tenantId)).Should().BeEquivalentTo(beforeJobs);
	}

	[Fact]
	public async Task ItShouldRollBackTheWholeBatchIncludingEnqueuedJobsOnFailure() {
		using var db = await NewDbAsync();
		var (tenantId, actorUserId) = await SeedTenantAsync(db);
		var postId = await SeedPostAsync(db, tenantId, actorUserId);
		var accountA = await SeedAccountAsync(db, tenantId);
		var accountB = await SeedAccountAsync(db, tenantId);

		var inner = new JobEnqueuer(
			db,
			new RequestAuthContext {
				SessionToken = "spec-session",
				UserId = actorUserId,
				TenantId = tenantId.ToString(),
			}
		);
		var service = new PublishNowService(db, new ThrowOnSecondEnqueue(inner));

		var beforeJobs = await JobRowsAsync(db, tenantId);

		var act = async () => await service.PublishNowAsync(
			new PublishNowArgs(tenantId, postId, actorUserId, [accountA, accountB]),
			CancellationToken.None
		);

		await act.Should().ThrowAsync<InvalidOperationException>(
			"the forced mid-batch enqueue failure surfaces instead of being swallowed"
		);

		var survivingRows = await RowsForPostAsync(db, tenantId, postId);
		survivingRows.Should().BeEmpty("the rolled-back transaction removes the rows");

		var jobsAfter = await JobRowsAsync(db, tenantId);
		jobsAfter.Should().BeEquivalentTo(
			beforeJobs,
			"a domain rollback takes its already-enqueued job with it"
		);
	}

	// Spec-forced enqueue failure: the FIRST call delegates to the real enqueuer,
	// every later call throws, simulating a database refusal mid-batch.
	private sealed class ThrowOnSecondEnqueue : IJobEnqueuer {
		private readonly IJobEnqueuer _inner;
		private int _calls;

		public ThrowOnSecondEnqueue(IJobEnqueuer inner) {
			_inner = inner;
		}

		public async Task<Guid> EnqueueAsync<TPayload>(
			JobDefinition<TPayload> definition,
			TPayload payload,
			EnqueueOptions? options = null,
			CancellationToken cancellationToken = default
		) {
			_calls++;
			if (_calls >= 2) {
				throw new InvalidOperationException("spec-forced enqueue failure");
			}

			return await _inner.EnqueueAsync(
				definition,
				payload,
				options,
				cancellationToken
			);
		}
	}
}
