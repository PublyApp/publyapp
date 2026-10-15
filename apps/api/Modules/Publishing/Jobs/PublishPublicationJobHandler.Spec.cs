using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Lib;
using PublyApp.Api.Modules.Publishing.Providers;
using PublyApp.Api.Modules.Publishing.Services;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Jobs;

// Direct-invocation integration spec (real ephemeral Postgres, faked Bluesky + faked
// session — Bluesky is NEVER contacted). Pins every classified failure kind onto its
// exact domain outcome: Published / Failed(content, no retry) / Paused +
// NeedsReconnect(account) / transient → Retry until the ceiling, then Failed plus the
// terminal-hook account flag. Also pins the trusted enqueue path: derived key,
// in-flight dedup, mismatch rejection.
public sealed class PublishPublicationJobHandlerSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;

	public PublishPublicationJobHandlerSpec(ApiFixture fixture) {
		this._Fixture = fixture;
	}

	private async Task<AppDbContext> _NewDbAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
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

	private sealed record SeededPublication(
		Guid TenantId,
		Guid SocialAccountId,
		Guid PublicationId,
		string IdempotencyKey
	);

	private static async Task<SeededPublication> _SeedAsync(
		AppDbContext db,
		PublicationStatus status
	) {
		var tenant = new PublyApp.Api.Modules.Tenants.Entities.Tenant {
			Name = $"pub-job-{Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = PublyApp.Api.Modules.Tenants.Entities.TenantStatus.Active,
			MaxUsers = 10,
		};
		var user = new User {
			Email = $"pub-job-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true,
		};
		db.Tenant.Add(tenant);
		db.User.Add(user);
		await db.SaveChangesAsync();

		var tenantId = tenant.GetRequiredId();
		var userId = user.GetRequiredId();

		var post = new Post {
			TenantId = tenantId,
			Body = "hello from the publish job spec",
			CreatedByUserId = userId,
		};
		var account = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@jobspec.bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		db.Post.Add(post);
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();

		var publication = new Publication {
			TenantId = tenantId,
			PostId = post.GetRequiredId(),
			SocialAccountId = account.GetRequiredId(),
			Status = status,
			ScheduledAtUtc = DateTime.UtcNow.AddHours(1),
			ScheduledTimeZone = "Etc/UTC",
			IdempotencyKey = "placeholder",
		};
		db.Publication.Add(publication);
		await db.SaveChangesAsync();

		// The key derives deterministically from the persisted row id (Epic A §4.1).
		publication.IdempotencyKey =
			PublicationIdempotencyKey.For(publication.GetRequiredId());
		await db.SaveChangesAsync();

		return new SeededPublication(
			tenantId,
			account.GetRequiredId(),
			publication.GetRequiredId(),
			publication.IdempotencyKey
		);
	}

	private static JobContext _NewContext(
		PublishPublicationPayload payload,
		int attempts = 0,
		int maxAttempts = 3,
		string? lastError = null
	) {
		return new JobContext {
			JobId = Guid.NewGuid(),
			JobType = PublishingJobs.PublishPublicationV1.JobType,
			Payload = JobJson.Serialize(payload),
			Attempts = attempts,
			MaxAttempts = maxAttempts,
			LastError = lastError,
		};
	}

	private static LocalDiskFileStorage _NewStorage() {
		return new LocalDiskFileStorage(
			Path.Combine(Path.GetTempPath(), $"publish-job-spec-{Guid.NewGuid():N}")
		);
	}

	private static PublishPublicationJobHandler _NewHandler(
		AppDbContext db,
		IPublishProvider publishProvider,
		ISocialSessionProvider sessionProvider,
		IFileStorage? storage = null
	) {
		return new PublishPublicationJobHandler(
			db,
			storage ?? PublishPublicationJobHandlerSpec._NewStorage(),
			publishProvider,
			sessionProvider,
			new PublicationStatusTransitionService(db)
		);
	}

	// Extra publication on an existing account/tenant, mirroring _SeedAsync's shape.
	private static async Task<Guid> _SeedSiblingAsync(
		AppDbContext db,
		Guid tenantId,
		Guid socialAccountId,
		PublicationStatus status
	) {
		var createdByUserId = await db.Post
			.Where(p => p.TenantId == tenantId)
			.Select(p => p.CreatedByUserId)
			.FirstAsync();
		var post = new Post {
			TenantId = tenantId,
			Body = "sibling body from the publish job spec",
			CreatedByUserId = createdByUserId,
		};
		db.Post.Add(post);
		await db.SaveChangesAsync();

		var publication = new Publication {
			TenantId = tenantId,
			PostId = post.GetRequiredId(),
			SocialAccountId = socialAccountId,
			Status = status,
			ScheduledAtUtc = DateTime.UtcNow.AddHours(2),
			ScheduledTimeZone = "Etc/UTC",
			IdempotencyKey = "placeholder",
		};
		db.Publication.Add(publication);
		await db.SaveChangesAsync();
		publication.IdempotencyKey =
			PublicationIdempotencyKey.For(publication.GetRequiredId());
		await db.SaveChangesAsync();
		return publication.GetRequiredId();
	}

	private static async Task<Guid> _SeedSecondAccountAsync(
		AppDbContext db,
		Guid tenantId
	) {
		var account = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@jobspec-second.bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();
		return account.GetRequiredId();
	}

	private static async Task<Publication> _FreshPublicationAsync(
		AppDbContext db,
		Guid publicationId
	) {
		var entity = await db.Publication.SingleAsync(p => p.Id == publicationId);
		await db.Entry(entity).ReloadAsync();
		return entity;
	}

	[Fact]
	public async Task ItShouldPublishStampTheAccountLastSuccessAtAndStoreTheRecordLink() {
		using var db = await this._NewDbAsync();
		var seeded = await PublishPublicationJobHandlerSpec._SeedAsync(db, PublicationStatus.Scheduled);
		var recordUri = $"at://did:plc:x/app.bsky.feed.post/pub-{seeded.IdempotencyKey}";

		var sessionProvider = FakeSessions.Opened();
		var publishProvider = new FakePublishProvider(
			new PublishResult.Published(recordUri, $"https://bsky.app/profile/x/post/{recordUri}")
		);
		var handler = PublishPublicationJobHandlerSpec._NewHandler(db, publishProvider, sessionProvider);

		var outcome = await handler.HandleAsync(
			PublishPublicationJobHandlerSpec._NewContext(
				new PublishPublicationPayload {
					PublicationId = seeded.PublicationId,
					IdempotencyKey = seeded.IdempotencyKey,
				}
			),
			CancellationToken.None
		);

		outcome.Should().BeOfType<JobOutcome.Success>();
		await db.Entry(await db.Publication.SingleAsync(p => p.Id == seeded.PublicationId))
			.ReloadAsync();
		var publication = await db.Publication.SingleAsync(p => p.Id == seeded.PublicationId);
		publication.Status.Should().Be(PublicationStatus.Published);
		publication.ExternalRecordId.Should().Be(recordUri);
		publication.ExternalUrl.Should().NotBeNullOrEmpty();
		publication.LastError.Should().BeNull();

		var account = await db.SocialAccount.SingleAsync(a => a.Id == seeded.SocialAccountId);
		account.LastSuccessAt.Should().NotBeNull("a successful publish stamps the account");
	}

	[Fact]
	public async Task ItShouldTreatAlreadyExistsAsSuccessWithTheExistingRecordAndNoDuplicate() {
		using var db = await this._NewDbAsync();
		var seeded = await PublishPublicationJobHandlerSpec._SeedAsync(db, PublicationStatus.Scheduled);

		// Crash-after-create simulation: the remote record ALREADY exists under the
		// deterministic key (previous attempt created it, then timed out). The retry
		// must adopt THAT record — exactly one remote record, never two.
		var publishProvider = new FakePublishProvider(
			new PublishResult.AlreadyExistsTreatedAsPublished(
				$"at://did:plc:x/app.bsky.feed.post/pub-{seeded.IdempotencyKey}",
				"https://bsky.app/profile/x/post/existing"
			)
		);
		var handler = PublishPublicationJobHandlerSpec._NewHandler(db, publishProvider, FakeSessions.Opened());

		var outcome = await handler.HandleAsync(
			PublishPublicationJobHandlerSpec._NewContext(
				new PublishPublicationPayload {
					PublicationId = seeded.PublicationId,
					IdempotencyKey = seeded.IdempotencyKey,
				}
			),
			CancellationToken.None
		);

		outcome.Should().BeOfType<JobOutcome.Success>("already-exists IS success");
		var publication = await db.Publication.SingleAsync(p => p.Id == seeded.PublicationId);
		await db.Entry(publication).ReloadAsync();
		publication.Status.Should().Be(PublicationStatus.Published);
		publication.ExternalRecordId.Should().Contain(seeded.IdempotencyKey);

		publishProvider.RemoteRecords.Should().HaveCount(1, "no duplicate was created");
		publishProvider.Requests.Should().ContainSingle(
			"the deterministic key means one logical delivery attempt chain"
		);
	}

	[Fact]
	public async Task ItShouldNeverDowngradeARevokedAccountToNeedsReconnect() {
		using var db = await this._NewDbAsync();
		var seeded = await PublishPublicationJobHandlerSpec._SeedAsync(db, PublicationStatus.InProgress);
		var account = await db.SocialAccount.SingleAsync(a => a.Id == seeded.SocialAccountId);
		account.Status = SocialAccountStatus.Revoked;
		await db.SaveChangesAsync();
		var handler = PublishPublicationJobHandlerSpec._NewHandler(
			db, new FakePublishProvider(null), FakeSessions.AccountFailure("no usable stored credential")
		);

		var outcome = await handler.HandleAsync(
			PublishPublicationJobHandlerSpec._NewContext(
				new PublishPublicationPayload {
					PublicationId = seeded.PublicationId,
					IdempotencyKey = seeded.IdempotencyKey,
				}
			),
			CancellationToken.None
		);

		outcome.Should().BeOfType<JobOutcome.Success>();
		await db.Entry(account).ReloadAsync();
		account.Status.Should().Be(SocialAccountStatus.Revoked, "a chosen disconnect stays disconnected");
	}

	[Fact]
	public async Task ItShouldPublishARetriedPublicationAsAlreadyExistsWithoutASecondRecord() {
		using var db = await this._NewDbAsync();
		var seeded = await PublishPublicationJobHandlerSpec._SeedAsync(db, PublicationStatus.InProgress);
		var transitions = new PublicationStatusTransitionService(db);
		_ = await transitions.MarkFailedAsync(
			new MarkPublicationFailedArgs(
				seeded.PublicationId,
				seeded.TenantId,
				"publishing did not succeed after 3 attempts: timeout",
				PublicationFailureCategory.RetryLater
			),
			CancellationToken.None
		);

		// Retry keeps the row and its key; the provider already accepted attempt one.
		_ = await transitions.RetryAsync(
			new RetryPublicationArgs(seeded.PublicationId, seeded.TenantId),
			CancellationToken.None
		);
		var publishProvider = new FakePublishProvider(
			new PublishResult.AlreadyExistsTreatedAsPublished(
				$"at://did:plc:x/app.bsky.feed.post/pub-{seeded.IdempotencyKey}",
				"https://bsky.app/profile/x/post/existing"
			)
		);
		var handler = PublishPublicationJobHandlerSpec._NewHandler(db, publishProvider, FakeSessions.Opened());

		var outcome = await handler.HandleAsync(
			PublishPublicationJobHandlerSpec._NewContext(
				new PublishPublicationPayload {
					PublicationId = seeded.PublicationId,
					IdempotencyKey = seeded.IdempotencyKey,
				}
			),
			CancellationToken.None
		);

		outcome.Should().BeOfType<JobOutcome.Success>();
		var publication = await db.Publication.SingleAsync(p => p.Id == seeded.PublicationId);
		await db.Entry(publication).ReloadAsync();
		publication.Status.Should().Be(PublicationStatus.Published);
		publication.LastError.Should().BeNull("the cause clears once the new attempt starts");
		publication.FailureCategory.Should().BeNull();
		publication.Attempts.Should().Be(1, "the retry reset the counter before the new attempt");
		publishProvider.RemoteRecords.Should().HaveCount(1, "no second record");
		(await db.Publication.CountAsync(p => p.PostId == publication.PostId)).Should().Be(1);
	}

	[Fact]
	public async Task ItShouldFailAtDispatchWithoutAProviderCallWhenTheBodyBecameOverLimit() {
		using var db = await this._NewDbAsync();
		var seeded = await PublishPublicationJobHandlerSpec._SeedAsync(db, PublicationStatus.InProgress);
		var postId = (await db.Publication.SingleAsync(p => p.Id == seeded.PublicationId)).PostId;
		var post = await db.Post.SingleAsync(p => p.Id == postId);
		post.Body = new string('a', 301);
		await db.SaveChangesAsync();
		var publishProvider = new FakePublishProvider(null);
		var handler = PublishPublicationJobHandlerSpec._NewHandler(db, publishProvider, FakeSessions.Opened());

		var outcome = await handler.HandleAsync(
			PublishPublicationJobHandlerSpec._NewContext(
				new PublishPublicationPayload {
					PublicationId = seeded.PublicationId,
					IdempotencyKey = seeded.IdempotencyKey,
				}
			),
			CancellationToken.None
		);

		outcome.Should().BeOfType<JobOutcome.Success>();
		publishProvider.Requests.Should().BeEmpty("no provider call for an invalid body");
		var publication = await db.Publication.SingleAsync(p => p.Id == seeded.PublicationId);
		await db.Entry(publication).ReloadAsync();
		publication.Status.Should().Be(PublicationStatus.Failed);
		publication.LastError.Should().Contain("too long", "the cause names the content problem");
		publication.LastError.Should().Contain("301");
	}

	[Fact]
	public async Task ItShouldFailWithoutRetryWhenBlueskyRefusesTheContent() {
		using var db = await this._NewDbAsync();
		var seeded = await PublishPublicationJobHandlerSpec._SeedAsync(db, PublicationStatus.InProgress);
		var publishProvider = new FakePublishProvider(
			new PublishResult.ContentFailure("the post body exceeds the 300 grapheme limit")
		);
		var handler = PublishPublicationJobHandlerSpec._NewHandler(db, publishProvider, FakeSessions.Opened());

		var outcome = await handler.HandleAsync(
			PublishPublicationJobHandlerSpec._NewContext(
				new PublishPublicationPayload {
					PublicationId = seeded.PublicationId,
					IdempotencyKey = seeded.IdempotencyKey,
				}
			),
			CancellationToken.None
		);

		outcome.Should().BeOfType<JobOutcome.Success>(
			"content failure is domain-terminal; the engine deletes instead of retrying"
		);
		var publication = await db.Publication.SingleAsync(p => p.Id == seeded.PublicationId);
		await db.Entry(publication).ReloadAsync();
		publication.Status.Should().Be(PublicationStatus.Failed);
		publication.LastError.Should().Contain(
			"the post body exceeds the 300 grapheme limit",
			"the persisted cause names what went wrong in plain words"
		);
		publication.FailureCategory.Should().Be(PublicationFailureCategory.FixContent);

		var account = await db.SocialAccount.SingleAsync(a => a.Id == seeded.SocialAccountId);
		account.Status.Should().NotBe(SocialAccountStatus.NeedsReconnect);
		account.LastSuccessAt.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldPauseAndFlagNeedsReconnectWhenTheSessionFailsOnTheAccount() {
		using var db = await this._NewDbAsync();
		var seeded = await PublishPublicationJobHandlerSpec._SeedAsync(db, PublicationStatus.InProgress);
		var sessionProvider = FakeSessions.AccountFailure(
			"the app password 'correct-horse-battery' was revoked"
		);
		var publishProvider = new FakePublishProvider(null);
		var handler = PublishPublicationJobHandlerSpec._NewHandler(db, publishProvider, sessionProvider);

		var outcome = await handler.HandleAsync(
			PublishPublicationJobHandlerSpec._NewContext(
				new PublishPublicationPayload {
					PublicationId = seeded.PublicationId,
					IdempotencyKey = seeded.IdempotencyKey,
				}
			),
			CancellationToken.None
		);

		outcome.Should().BeOfType<JobOutcome.Success>();
		var publication = await db.Publication.SingleAsync(p => p.Id == seeded.PublicationId);
		await db.Entry(publication).ReloadAsync();
		publication.Status.Should().Be(PublicationStatus.Paused);
		publication.FailureCategory.Should().Be(PublicationFailureCategory.Reconnect);
		publication.LastError.Should().Contain("needs reconnecting");

		var account = await db.SocialAccount.SingleAsync(a => a.Id == seeded.SocialAccountId);
		account.Status.Should().Be(SocialAccountStatus.NeedsReconnect);
		account.LastError.Should().NotBeNullOrEmpty();
		account.LastError.Should().NotContain(
			"correct-horse-battery", "secrets never reach the database"
		);
		publishProvider.Requests.Should().BeEmpty(
			"a dead session never reaches the delivery seam"
		);
	}

	[Fact]
	public async Task ItShouldPauseAndFlagNeedsReconnectWhenTheProviderRefusesTheCredential() {
		using var db = await this._NewDbAsync();
		var seeded = await PublishPublicationJobHandlerSpec._SeedAsync(db, PublicationStatus.InProgress);
		var publishProvider = new FakePublishProvider(
			new PublishResult.AccountFailure("InvalidToken: the session was revoked")
		);
		var handler = PublishPublicationJobHandlerSpec._NewHandler(db, publishProvider, FakeSessions.Opened());

		var outcome = await handler.HandleAsync(
			PublishPublicationJobHandlerSpec._NewContext(
				new PublishPublicationPayload {
					PublicationId = seeded.PublicationId,
					IdempotencyKey = seeded.IdempotencyKey,
				}
			),
			CancellationToken.None
		);

		outcome.Should().BeOfType<JobOutcome.Success>();
		var publication = await db.Publication.SingleAsync(p => p.Id == seeded.PublicationId);
		await db.Entry(publication).ReloadAsync();
		publication.Status.Should().Be(PublicationStatus.Paused);
		var account = await db.SocialAccount.SingleAsync(a => a.Id == seeded.SocialAccountId);
		account.Status.Should().Be(SocialAccountStatus.NeedsReconnect);
	}

	[Fact]
	public async Task ItShouldReturnRetryAndStayInProgressForATransientFailure() {
		using var db = await this._NewDbAsync();
		var seeded = await PublishPublicationJobHandlerSpec._SeedAsync(db, PublicationStatus.Scheduled);
		var publishProvider = new FakePublishProvider(
			new PublishResult.TransientFailure("the PDS returned 503 overloaded")
		);
		var handler = PublishPublicationJobHandlerSpec._NewHandler(db, publishProvider, FakeSessions.Opened());

		var outcome = await handler.HandleAsync(
			PublishPublicationJobHandlerSpec._NewContext(
				new PublishPublicationPayload {
					PublicationId = seeded.PublicationId,
					IdempotencyKey = seeded.IdempotencyKey,
				},
				attempts: 0
			),
			CancellationToken.None
		);

		var retry = outcome.Should().BeOfType<JobOutcome.Retry>().Subject;
		retry.Error.Should().Contain("503");
		var publication = await db.Publication.SingleAsync(p => p.Id == seeded.PublicationId);
		await db.Entry(publication).ReloadAsync();
		publication.Status.Should().Be(PublicationStatus.InProgress, "the engine owns the retry");
		publication.Attempts.Should().Be(1);
		publication.LastError.Should().BeNull("no terminal state was reached");
	}

	[Fact]
	public async Task ItShouldFailThePublicationAndFlagTheAccountAfterTheFinalAttempt() {
		using var db = await this._NewDbAsync();
		var seeded = await PublishPublicationJobHandlerSpec._SeedAsync(db, PublicationStatus.InProgress);
		var publishProvider = new FakePublishProvider(
			new PublishResult.TransientFailure("connection reset by peer")
		);
		var handler = PublishPublicationJobHandlerSpec._NewHandler(db, publishProvider, FakeSessions.Opened());
		var payload = new PublishPublicationPayload {
			PublicationId = seeded.PublicationId,
			IdempotencyKey = seeded.IdempotencyKey,
		};

		// The engine owns transient retries: each run receives Attempts = number of
		// PRIOR failed runs (ceiling 3) and the transition service bumps the row's
		// Attempts on every MarkInProgress. Simulate the real chain run by run.
		var first = await handler.HandleAsync(
			PublishPublicationJobHandlerSpec._NewContext(payload, attempts: 0), CancellationToken.None
		);
		first.Should().BeOfType<JobOutcome.Retry>("the engine schedules the next run");
		var second = await handler.HandleAsync(
			PublishPublicationJobHandlerSpec._NewContext(payload, attempts: 1), CancellationToken.None
		);
		second.Should().BeOfType<JobOutcome.Retry>();
		var outcome = await handler.HandleAsync(
			PublishPublicationJobHandlerSpec._NewContext(payload, attempts: 2), CancellationToken.None
		);

		outcome.Should().BeOfType<JobOutcome.PermanentFailure>(
			"an exhausted transient chain leaves the queue toward the DLQ"
		);
		var publication = await db.Publication.SingleAsync(p => p.Id == seeded.PublicationId);
		await db.Entry(publication).ReloadAsync();
		publication.Status.Should().Be(PublicationStatus.Failed);
		publication.Attempts.Should().Be(3);
		publication.LastError.Should().Contain("did not succeed after 3 attempts");
		publication.FailureCategory.Should().Be(PublicationFailureCategory.RetryLater);

		// The engine invokes the terminal hook INSIDE the DLQ transaction; the account
		// must hear about the exhausted chain while the publication stays Failed.
		await handler.OnTerminalFailureAsync(
			PublishPublicationJobHandlerSpec._NewContext(payload, lastError: "connection reset by peer"), CancellationToken.None
		);
		var account = await db.SocialAccount.SingleAsync(a => a.Id == seeded.SocialAccountId);
		account.Status.Should().Be(SocialAccountStatus.NeedsReconnect);
		account.LastError.Should().Contain("reconnect the account");
	}

	[Fact]
	public async Task ItShouldCancelWhenThePublicationIsMissingOrAlreadyTerminal() {
		using var db = await this._NewDbAsync();
		var missingHandler = PublishPublicationJobHandlerSpec._NewHandler(
			db, new FakePublishProvider(null), FakeSessions.Opened()
		);

		var missingId = Guid.NewGuid();
		var missingOutcome = await missingHandler.HandleAsync(
			PublishPublicationJobHandlerSpec._NewContext(
				new PublishPublicationPayload {
					PublicationId = missingId,
					IdempotencyKey = PublicationIdempotencyKey.For(missingId),
				}
			),
			CancellationToken.None
		);
		missingOutcome.Should().BeOfType<JobOutcome.Cancelled>().Which.Reason.Should()
			.Be("publication_not_found");

		// At-least-once replay: a rerun after success is a harmless no-op.
		var seeded = await PublishPublicationJobHandlerSpec._SeedAsync(db, PublicationStatus.Published);
		var replayHandler = PublishPublicationJobHandlerSpec._NewHandler(
			db,
			new FakePublishProvider(
				new PublishResult.Published("at://did:plc:x/app.bsky.feed.post/rerun", "u")
			),
			FakeSessions.Opened()
		);
		var replayOutcome = await replayHandler.HandleAsync(
			PublishPublicationJobHandlerSpec._NewContext(
				new PublishPublicationPayload {
					PublicationId = seeded.PublicationId,
					IdempotencyKey = seeded.IdempotencyKey,
				}
			),
			CancellationToken.None
		);
		replayOutcome.Should().BeOfType<JobOutcome.Cancelled>().Which.Reason.Should()
			.Be("publication_already_terminal");
	}

	[Fact]
	public async Task ItShouldEnqueueOnlyThroughIJobEnqueuerWithTheDerivedKeyAndDedupInFlight() {
		using var db = await this._NewDbAsync();
		var seeded = await PublishPublicationJobHandlerSpec._SeedAsync(db, PublicationStatus.Scheduled);
		var enqueuer = new JobEnqueuer(db, new RequestAuthContext());
		var payload = new PublishPublicationPayload {
			PublicationId = seeded.PublicationId,
			IdempotencyKey = seeded.IdempotencyKey,
		};

		try {
			var jobId = await enqueuer.EnqueueAsync(
				PublishingJobs.PublishPublicationV1,
				payload,
				new EnqueueOptions { IdempotencyKey = seeded.IdempotencyKey }
			);

			jobId.Should().NotBe(Guid.Empty);
			var row = await db.JobQueue.SingleAsync(j => j.JobType ==
				PublishingJobs.PublishPublicationV1JobType);
			row.Payload.Should().Contain(seeded.PublicationId.ToString());
			row.Priority.Should().Be(0);
			row.MaxAttempts.Should()
				.Be(3, "three attempts before the engine dead-letters (brief §5)");

			// Same key while the first is in flight → unique violation (F13 dedup).
			await using var secondContext = await this._NewDbAsync();
			var secondEnqueuer = new JobEnqueuer(secondContext, new RequestAuthContext());
			var act = async () => await secondEnqueuer.EnqueueAsync(
				PublishingJobs.PublishPublicationV1,
				payload,
				new EnqueueOptions { IdempotencyKey = seeded.IdempotencyKey }
			);
			await act.Should().ThrowAsync<DbUpdateException>();

			// A key that does NOT derive from the publication id is refused at enqueue.
			await using var thirdContext = await this._NewDbAsync();
			var thirdEnqueuer = new JobEnqueuer(thirdContext, new RequestAuthContext());
			var forged = async () => await thirdEnqueuer.EnqueueAsync(
				PublishingJobs.PublishPublicationV1,
				payload with { IdempotencyKey = "forged-key" }
			);
			await forged.Should().ThrowAsync<InvalidOperationException>();
		} finally {
			var strays = await db.JobQueue
				.Where(j => j.JobType == PublishingJobs.PublishPublicationV1JobType)
				.ToListAsync();
			db.JobQueue.RemoveRange(strays);
			await db.SaveChangesAsync();
		}
	}

	// --- fakes -----------------------------------------------------------------------

	private static async Task<IReadOnlyList<byte[]>> _SeedImagesAsync(
		AppDbContext db,
		IFileStorage storage,
		Guid publicationId,
		params (string ContentType, string Extension, byte[] Bytes, string? Alt)[] images
	) {
		var publication = await db.Publication.SingleAsync(p => p.Id == publicationId);
		var post = await db.Post.SingleAsync(p => p.Id == publication.PostId);
		var position = 0;
		foreach (var image in images) {
			using var stream = new MemoryStream(image.Bytes);
			var path = await storage.SaveAsync(stream, image.Extension);
			db.PostMediaAsset.Add(new PostMediaAsset {
				TenantId = publication.TenantId,
				PostId = post.GetRequiredId(),
				Position = position,
				RelativePath = path,
				ContentType = image.ContentType,
				AltText = image.Alt,
				WidthPx = 10,
				HeightPx = 10,
				SizeBytes = image.Bytes.Length,
				UploadedByUserId = post.CreatedByUserId,
			});
			position += 1;
		}
		await db.SaveChangesAsync();
		return images.Select(image => image.Bytes).ToList();
	}

	[Fact]
	public async Task ItShouldHandTheProviderTheImagesInOrderWithTheirBytesAndAlt() {
		using var db = await this._NewDbAsync();
		var seeded = await PublishPublicationJobHandlerSpec._SeedAsync(db, PublicationStatus.InProgress);
		var storage = PublishPublicationJobHandlerSpec._NewStorage();
		var bytes = await PublishPublicationJobHandlerSpec._SeedImagesAsync(
			db,
			storage,
			seeded.PublicationId,
			("image/png", ".png", TestImages.Png(12, 12), "first"),
			("image/jpeg", ".jpg", TestImages.Jpeg(14, 14), null)
		);
		var publishProvider = new FakePublishProvider(
			new PublishResult.Published("at://did:plc:x/app.bsky.feed.post/k", "https://bsky.app/x")
		);
		var handler = PublishPublicationJobHandlerSpec._NewHandler(
			db, publishProvider, FakeSessions.Opened(), storage
		);

		var outcome = await handler.HandleAsync(
			PublishPublicationJobHandlerSpec._NewContext(
				new PublishPublicationPayload {
					PublicationId = seeded.PublicationId,
					IdempotencyKey = seeded.IdempotencyKey,
				}
			),
			CancellationToken.None
		);

		outcome.Should().BeOfType<JobOutcome.Success>();
		var media = publishProvider.Requests.Should().ContainSingle().Subject.Media;
		media.Should().HaveCount(2);
		media[0].AltText.Should().Be("first");
		media[0].ContentType.Should().Be("image/png");
		media[0].Content.Should().Equal(bytes[0]);
		media[1].AltText.Should().BeNull();
		media[1].Content.Should().Equal(bytes[1]);
	}

	[Fact]
	public async Task ItShouldFailWithoutRetryNamingTheImageWhenItsFileIsMissingFromStorage() {
		using var db = await this._NewDbAsync();
		var seeded = await PublishPublicationJobHandlerSpec._SeedAsync(db, PublicationStatus.InProgress);
		var storage = PublishPublicationJobHandlerSpec._NewStorage();
		await PublishPublicationJobHandlerSpec._SeedImagesAsync(
			db,
			storage,
			seeded.PublicationId,
			("image/png", ".png", TestImages.Png(12, 12), null),
			("image/png", ".png", TestImages.Png(13, 13), null)
		);
		var secondPath = await db.PostMediaAsset
			.Where(media => media.Position == 1 && media.TenantId == seeded.TenantId)
			.Select(media => media.RelativePath)
			.SingleAsync();
		await storage.DeleteAsync(secondPath);
		var publishProvider = new FakePublishProvider(null);
		var handler = PublishPublicationJobHandlerSpec._NewHandler(
			db, publishProvider, FakeSessions.Opened(), storage
		);

		var outcome = await handler.HandleAsync(
			PublishPublicationJobHandlerSpec._NewContext(
				new PublishPublicationPayload {
					PublicationId = seeded.PublicationId,
					IdempotencyKey = seeded.IdempotencyKey,
				}
			),
			CancellationToken.None
		);

		outcome.Should().BeOfType<JobOutcome.Success>("a content failure is terminal, never retried");
		publishProvider.Requests.Should().BeEmpty();
		var publication = await PublishPublicationJobHandlerSpec._FreshPublicationAsync(db, seeded.PublicationId);
		publication.Status.Should().Be(PublicationStatus.Failed);
		publication.LastError.Should().Contain("image 2 is no longer available");
	}

	[Fact]
	public async Task ItShouldFailAtDispatchWhenAnAttachedImageIsOfAnUnacceptedType() {
		using var db = await this._NewDbAsync();
		var seeded = await PublishPublicationJobHandlerSpec._SeedAsync(db, PublicationStatus.InProgress);
		var storage = PublishPublicationJobHandlerSpec._NewStorage();
		await PublishPublicationJobHandlerSpec._SeedImagesAsync(
			db,
			storage,
			seeded.PublicationId,
			("image/gif", ".gif", [1, 2, 3], null)
		);
		var publishProvider = new FakePublishProvider(null);
		var handler = PublishPublicationJobHandlerSpec._NewHandler(
			db, publishProvider, FakeSessions.Opened(), storage
		);

		var outcome = await handler.HandleAsync(
			PublishPublicationJobHandlerSpec._NewContext(
				new PublishPublicationPayload {
					PublicationId = seeded.PublicationId,
					IdempotencyKey = seeded.IdempotencyKey,
				}
			),
			CancellationToken.None
		);

		outcome.Should().BeOfType<JobOutcome.Success>();
		publishProvider.Requests.Should().BeEmpty();
		var publication = await PublishPublicationJobHandlerSpec._FreshPublicationAsync(db, seeded.PublicationId);
		publication.Status.Should().Be(PublicationStatus.Failed);
		publication.LastError.Should().Contain("Image 1");
	}

	[Fact]
	public async Task ItShouldPauseAllOtherScheduledPublicationsOfTheSameAccountOnCredentialFailure() {
		using var db = await this._NewDbAsync();
		var seeded = await PublishPublicationJobHandlerSpec._SeedAsync(db, PublicationStatus.Scheduled);
		var s1 = await PublishPublicationJobHandlerSpec._SeedSiblingAsync(db, seeded.TenantId, seeded.SocialAccountId, PublicationStatus.Scheduled);
		var s2 = await PublishPublicationJobHandlerSpec._SeedSiblingAsync(db, seeded.TenantId, seeded.SocialAccountId, PublicationStatus.Scheduled);
		var otherAccount = await PublishPublicationJobHandlerSpec._SeedSecondAccountAsync(db, seeded.TenantId);
		var s3 = await PublishPublicationJobHandlerSpec._SeedSiblingAsync(db, seeded.TenantId, otherAccount, PublicationStatus.Scheduled);

		var sessionProvider = FakeSessions.AccountFailure(
			"the app password 'correct-horse-battery' was revoked"
		);
		var handler = PublishPublicationJobHandlerSpec._NewHandler(db, new FakePublishProvider(null), sessionProvider);

		var outcome = await handler.HandleAsync(
			PublishPublicationJobHandlerSpec._NewContext(
				new PublishPublicationPayload {
					PublicationId = seeded.PublicationId,
					IdempotencyKey = seeded.IdempotencyKey,
				}
			),
			CancellationToken.None
		);

		outcome.Should().BeOfType<JobOutcome.Success>();
		var failing = await PublishPublicationJobHandlerSpec._FreshPublicationAsync(db, seeded.PublicationId);
		failing.Status.Should().Be(PublicationStatus.Paused);

		foreach (var siblingId in new[] { s1, s2 }) {
			var sibling = await PublishPublicationJobHandlerSpec._FreshPublicationAsync(db, siblingId);
			sibling.Status.Should().Be(
				PublicationStatus.Paused,
				"scheduled siblings of a broken account must not stay queued behind dead credentials"
			);
			sibling.LastError.Should().Contain("needs reconnecting");
		}

		// A different account's publication is nobody else's failure.
		var untouched = await PublishPublicationJobHandlerSpec._FreshPublicationAsync(db, s3);
		untouched.Status.Should().Be(PublicationStatus.Scheduled);
		untouched.LastError.Should().BeNull();

		var account = await db.SocialAccount.SingleAsync(a => a.Id == seeded.SocialAccountId);
		account.Status.Should().Be(SocialAccountStatus.NeedsReconnect);
	}

	[Fact]
	public async Task ItShouldKeepSweepCausesSanitised() {
		using var db = await this._NewDbAsync();
		var seeded = await PublishPublicationJobHandlerSpec._SeedAsync(db, PublicationStatus.Scheduled);
		await PublishPublicationJobHandlerSpec._SeedSiblingAsync(db, seeded.TenantId, seeded.SocialAccountId, PublicationStatus.Scheduled);

		var handler = PublishPublicationJobHandlerSpec._NewHandler(
			db,
			new FakePublishProvider(null),
			FakeSessions.AccountFailure(
				"InvalidToken: the app password 'app-password-hunter2' was rejected by the PDS"
			)
		);

		var outcome = await handler.HandleAsync(
			PublishPublicationJobHandlerSpec._NewContext(
				new PublishPublicationPayload {
					PublicationId = seeded.PublicationId,
					IdempotencyKey = seeded.IdempotencyKey,
				}
			),
			CancellationToken.None
		);

		outcome.Should().BeOfType<JobOutcome.Success>();
		var paused = await db.Publication
			.Where(p => p.SocialAccountId == seeded.SocialAccountId
				&& p.Status == PublicationStatus.Paused)
			.ToListAsync();
		paused.Should().HaveCount(2, "the failing run plus its scheduled sibling");
		foreach (var publication in paused) {
			publication.LastError.Should().NotBeNull();
			publication.LastError.Required().Should().Contain("[redacted]");
			publication.LastError.Required().Should().NotContain("app-password-hunter2");
		}

		var account = await db.SocialAccount.SingleAsync(a => a.Id == seeded.SocialAccountId);
		account.LastError.Should().NotContain("app-password-hunter2");
	}

	private static async Task _AddFollowUpsAsync(
		AppDbContext db,
		SeededPublication seeded,
		params string[] bodies
	) {
		var postId = (await db.Publication.SingleAsync(p => p.Id == seeded.PublicationId)).PostId;
		for (var index = 0; index < bodies.Length; index++) {
			db.PostSegment.Add(new PostSegment {
				TenantId = seeded.TenantId,
				PostId = postId,
				Position = index + 1,
				Body = bodies[index],
			});
		}

		await db.SaveChangesAsync();
	}

	private static PublishPublicationPayload _PayloadOf(SeededPublication seeded) {
		return new PublishPublicationPayload {
			PublicationId = seeded.PublicationId,
			IdempotencyKey = seeded.IdempotencyKey,
		};
	}

	[Fact]
	public async Task ItShouldPersistEachSegmentAsItLandsAndNameTheProgressWhenALaterSegmentFails() {
		using var db = await this._NewDbAsync();
		var seeded = await PublishPublicationJobHandlerSpec._SeedAsync(db, PublicationStatus.InProgress);
		await PublishPublicationJobHandlerSpec._AddFollowUpsAsync(db, seeded, "two", "three");
		var provider = new ThreadPublishProvider(
			landBeforeFailing: 2,
			new PublishResult.ContentFailure("400 InvalidRequest: bad record")
		);
		var handler = PublishPublicationJobHandlerSpec._NewHandler(db, provider, FakeSessions.Opened());

		var outcome = await handler.HandleAsync(
			PublishPublicationJobHandlerSpec._NewContext(PublishPublicationJobHandlerSpec._PayloadOf(seeded)),
			CancellationToken.None
		);

		outcome.Should().BeOfType<JobOutcome.Success>();
		provider.Requests.Should().ContainSingle();
		provider.Requests[0].FollowUpSegments.Should().Equal("two", "three");
		var stored = await db.PublicationSegmentResult
			.Where(result => result.PublicationId == seeded.PublicationId)
			.OrderBy(result => result.SegmentPosition)
			.ToListAsync();
		stored.Select(result => result.SegmentPosition).Should().Equal(0, 1);
		stored[1].ExternalCid.Should().Be("cid-1");
		var publication = await db.Publication.SingleAsync(p => p.Id == seeded.PublicationId);
		await db.Entry(publication).ReloadAsync();
		publication.Status.Should().Be(PublicationStatus.Failed);
		publication.LastError.Should().Contain("Published 2 of 3 segments; segment 3 failed");
		publication.LastError.Should().Contain("bad record");
	}

	[Fact]
	public async Task ItShouldResumeFromTheStoredSegmentsWithoutRepublishingThem() {
		using var db = await this._NewDbAsync();
		var seeded = await PublishPublicationJobHandlerSpec._SeedAsync(db, PublicationStatus.InProgress);
		await PublishPublicationJobHandlerSpec._AddFollowUpsAsync(db, seeded, "two", "three");
		var first = new ThreadPublishProvider(2, new PublishResult.TransientFailure("503 later"));
		var firstOutcome = await PublishPublicationJobHandlerSpec._NewHandler(db, first, FakeSessions.Opened())
			.HandleAsync(
				PublishPublicationJobHandlerSpec._NewContext(PublishPublicationJobHandlerSpec._PayloadOf(seeded)),
				CancellationToken.None
			);
		firstOutcome.Should().BeOfType<JobOutcome.Retry>();

		var second = new ThreadPublishProvider(1, new PublishResult.Published("at://root", "https://root"));
		var secondOutcome = await PublishPublicationJobHandlerSpec._NewHandler(db, second, FakeSessions.Opened())
			.HandleAsync(
				PublishPublicationJobHandlerSpec._NewContext(PublishPublicationJobHandlerSpec._PayloadOf(seeded), attempts: 1),
				CancellationToken.None
			);

		secondOutcome.Should().BeOfType<JobOutcome.Success>();
		second.Requests[0].CompletedSegments.Select(segment => segment.Position).Should().Equal(0, 1);
		second.Requests[0].CompletedSegments[1].Cid.Should().Be("cid-1");
		var stored = await db.PublicationSegmentResult
			.Where(result => result.PublicationId == seeded.PublicationId)
			.Select(result => result.SegmentPosition)
			.ToListAsync();
		stored.Order().Should().Equal(0, 1, 2);
		var publication = await db.Publication.SingleAsync(p => p.Id == seeded.PublicationId);
		await db.Entry(publication).ReloadAsync();
		publication.Status.Should().Be(PublicationStatus.Published);
	}

	[Fact]
	public async Task ItShouldFailAtDispatchNamingTheSegmentWhenAFollowUpIsOverTheLimit() {
		using var db = await this._NewDbAsync();
		var seeded = await PublishPublicationJobHandlerSpec._SeedAsync(db, PublicationStatus.InProgress);
		await PublishPublicationJobHandlerSpec._AddFollowUpsAsync(db, seeded, "fine", new string('b', 301));
		var provider = new FakePublishProvider(null);

		await PublishPublicationJobHandlerSpec._NewHandler(db, provider, FakeSessions.Opened()).HandleAsync(
			PublishPublicationJobHandlerSpec._NewContext(PublishPublicationJobHandlerSpec._PayloadOf(seeded)),
			CancellationToken.None
		);

		provider.Requests.Should().BeEmpty();
		var publication = await db.Publication.SingleAsync(p => p.Id == seeded.PublicationId);
		await db.Entry(publication).ReloadAsync();
		publication.Status.Should().Be(PublicationStatus.Failed);
		publication.LastError.Should().Contain("Segment 3").And.Contain("301");
	}

	// Lands the first N not-yet-completed segments through the progress callback
	// (like the real provider does), then ends with the configured outcome.
	private sealed class ThreadPublishProvider : IPublishProvider {
		private readonly int _LandBeforeFinishing;
		private readonly PublishResult _Final;

		public ThreadPublishProvider(int landBeforeFailing, PublishResult final) {
			this._LandBeforeFinishing = landBeforeFailing;
			this._Final = final;
		}

		public List<PublishRequest> Requests { get; } = [];

		public async Task<PublishResult> PublishAsync(
			PublishRequest request,
			CancellationToken cancellationToken
		) {
			this.Requests.Add(request);
			var next = request.CompletedSegments.Count;
			for (var landed = 0; landed < this._LandBeforeFinishing; landed++) {
				var position = next + landed;
				if (request.OnSegmentCompleted is not null) {
					await request.OnSegmentCompleted(
						new CompletedSegment(position, $"at://r/{position}", $"cid-{position}", $"https://u/{position}"),
						cancellationToken
					);
				}
			}

			return this._Final;
		}
	}

	private static class FakeSessions {
		public static FakeSocialSessionProvider Opened() {
			return new FakeSocialSessionProvider(
				new SocialSessionResult.Opened(
					new SocialSession("did:plc:x", "@h.test", "jwt-token", "https://pds.example")
				)
			);
		}

		public static FakeSocialSessionProvider AccountFailure(string cause) {
			return new FakeSocialSessionProvider(new SocialSessionResult.AccountFailure(cause));
		}
	}

	private sealed class FakeSocialSessionProvider : ISocialSessionProvider {
		private readonly SocialSessionResult _Result;

		public FakeSocialSessionProvider(SocialSessionResult result) {
			this._Result = result;
		}

		public Task<SocialSessionResult> OpenSessionAsync(
			Guid socialAccountId,
			CancellationToken cancellationToken
		) {
			return Task.FromResult(this._Result);
		}
	}

	private sealed class FakePublishProvider : IPublishProvider {
		private readonly PublishResult? _Result;
		private readonly List<string> _Records = [];

		public FakePublishProvider(PublishResult? result) {
			this._Result = result;
		}

		public List<PublishRequest> Requests { get; } = [];

		public IReadOnlyList<string> RemoteRecords { get { return this._Records; } }

		public Task<PublishResult> PublishAsync(
			PublishRequest request,
			CancellationToken cancellationToken
		) {
			this.Requests.Add(request);

			if (this._Result is null) {
				throw new InvalidOperationException(
					"FakePublishProvider reached without a configured outcome."
				);
			}

			if (this._Result is PublishResult.Published or PublishResult.AlreadyExistsTreatedAsPublished) {
				this._Records.Add(request.IdempotencyKey);
			}

			return Task.FromResult(this._Result);
		}
	}
}
