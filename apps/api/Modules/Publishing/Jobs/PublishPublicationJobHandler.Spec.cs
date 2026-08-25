using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Testing.Fixtures;
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
	private readonly ApiFixture _fixture;

	public PublishPublicationJobHandlerSpec(ApiFixture fixture) {
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

	private sealed record SeededPublication(
		Guid TenantId,
		Guid SocialAccountId,
		Guid PublicationId,
		string IdempotencyKey
	);

	private static async Task<SeededPublication> SeedAsync(
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

	private static JobContext NewContext(
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

	private static PublishPublicationJobHandler NewHandler(
		AppDbContext db,
		IPublishProvider publishProvider,
		ISocialSessionProvider sessionProvider
	) {
		return new PublishPublicationJobHandler(
			db,
			publishProvider,
			sessionProvider,
			new PublicationStatusTransitionService(db)
		);
	}

	[Fact]
	public async Task ItShouldPublishStampTheAccountLastSuccessAtAndStoreTheRecordLink() {
		using var db = await NewDbAsync();
		var seeded = await SeedAsync(db, PublicationStatus.Scheduled);
		var recordUri = $"at://did:plc:x/app.bsky.feed.post/pub-{seeded.IdempotencyKey}";

		var sessionProvider = FakeSessions.Opened();
		var publishProvider = new FakePublishProvider(
			new PublishResult.Published(recordUri, $"https://bsky.app/profile/x/post/{recordUri}")
		);
		var handler = NewHandler(db, publishProvider, sessionProvider);

		var outcome = await handler.HandleAsync(
			NewContext(
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
		using var db = await NewDbAsync();
		var seeded = await SeedAsync(db, PublicationStatus.Scheduled);

		// Crash-after-create simulation: the remote record ALREADY exists under the
		// deterministic key (previous attempt created it, then timed out). The retry
		// must adopt THAT record — exactly one remote record, never two.
		var publishProvider = new FakePublishProvider(
			new PublishResult.AlreadyExistsTreatedAsPublished(
				$"at://did:plc:x/app.bsky.feed.post/pub-{seeded.IdempotencyKey}",
				"https://bsky.app/profile/x/post/existing"
			)
		);
		var handler = NewHandler(db, publishProvider, FakeSessions.Opened());

		var outcome = await handler.HandleAsync(
			NewContext(
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
	public async Task ItShouldFailWithoutRetryWhenBlueskyRefusesTheContent() {
		using var db = await NewDbAsync();
		var seeded = await SeedAsync(db, PublicationStatus.InProgress);
		var publishProvider = new FakePublishProvider(
			new PublishResult.ContentFailure("the post body exceeds the 300 grapheme limit")
		);
		var handler = NewHandler(db, publishProvider, FakeSessions.Opened());

		var outcome = await handler.HandleAsync(
			NewContext(
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

		var account = await db.SocialAccount.SingleAsync(a => a.Id == seeded.SocialAccountId);
		account.Status.Should().NotBe(SocialAccountStatus.NeedsReconnect);
		account.LastSuccessAt.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldPauseAndFlagNeedsReconnectWhenTheSessionFailsOnTheAccount() {
		using var db = await NewDbAsync();
		var seeded = await SeedAsync(db, PublicationStatus.InProgress);
		var sessionProvider = FakeSessions.AccountFailure(
			"the app password 'correct-horse-battery' was revoked"
		);
		var publishProvider = new FakePublishProvider(null);
		var handler = NewHandler(db, publishProvider, sessionProvider);

		var outcome = await handler.HandleAsync(
			NewContext(
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
		using var db = await NewDbAsync();
		var seeded = await SeedAsync(db, PublicationStatus.InProgress);
		var publishProvider = new FakePublishProvider(
			new PublishResult.AccountFailure("InvalidToken: the session was revoked")
		);
		var handler = NewHandler(db, publishProvider, FakeSessions.Opened());

		var outcome = await handler.HandleAsync(
			NewContext(
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
		using var db = await NewDbAsync();
		var seeded = await SeedAsync(db, PublicationStatus.Scheduled);
		var publishProvider = new FakePublishProvider(
			new PublishResult.TransientFailure("the PDS returned 503 overloaded")
		);
		var handler = NewHandler(db, publishProvider, FakeSessions.Opened());

		var outcome = await handler.HandleAsync(
			NewContext(
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
		using var db = await NewDbAsync();
		var seeded = await SeedAsync(db, PublicationStatus.InProgress);
		var publishProvider = new FakePublishProvider(
			new PublishResult.TransientFailure("connection reset by peer")
		);
		var handler = NewHandler(db, publishProvider, FakeSessions.Opened());
		var payload = new PublishPublicationPayload {
			PublicationId = seeded.PublicationId,
			IdempotencyKey = seeded.IdempotencyKey,
		};

		// The engine owns transient retries: each run receives Attempts = number of
		// PRIOR failed runs (ceiling 3) and the transition service bumps the row's
		// Attempts on every MarkInProgress. Simulate the real chain run by run.
		var first = await handler.HandleAsync(
			NewContext(payload, attempts: 0), CancellationToken.None
		);
		first.Should().BeOfType<JobOutcome.Retry>("the engine schedules the next run");
		var second = await handler.HandleAsync(
			NewContext(payload, attempts: 1), CancellationToken.None
		);
		second.Should().BeOfType<JobOutcome.Retry>();
		var outcome = await handler.HandleAsync(
			NewContext(payload, attempts: 2), CancellationToken.None
		);

		outcome.Should().BeOfType<JobOutcome.PermanentFailure>(
			"an exhausted transient chain leaves the queue toward the DLQ"
		);
		var publication = await db.Publication.SingleAsync(p => p.Id == seeded.PublicationId);
		await db.Entry(publication).ReloadAsync();
		publication.Status.Should().Be(PublicationStatus.Failed);
		publication.Attempts.Should().Be(3);
		publication.LastError.Should().Contain("did not succeed after 3 attempts");

		// The engine invokes the terminal hook INSIDE the DLQ transaction; the account
		// must hear about the exhausted chain while the publication stays Failed.
		await handler.OnTerminalFailureAsync(
			NewContext(payload, lastError: "connection reset by peer"), CancellationToken.None
		);
		var account = await db.SocialAccount.SingleAsync(a => a.Id == seeded.SocialAccountId);
		account.Status.Should().Be(SocialAccountStatus.NeedsReconnect);
		account.LastError.Should().Contain("reconnect the account");
	}

	[Fact]
	public async Task ItShouldCancelWhenThePublicationIsMissingOrAlreadyTerminal() {
		using var db = await NewDbAsync();
		var missingHandler = NewHandler(
			db, new FakePublishProvider(null), FakeSessions.Opened()
		);

		var missingId = Guid.NewGuid();
		var missingOutcome = await missingHandler.HandleAsync(
			NewContext(
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
		var seeded = await SeedAsync(db, PublicationStatus.Published);
		var replayHandler = NewHandler(
			db,
			new FakePublishProvider(
				new PublishResult.Published("at://did:plc:x/app.bsky.feed.post/rerun", "u")
			),
			FakeSessions.Opened()
		);
		var replayOutcome = await replayHandler.HandleAsync(
			NewContext(
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
		using var db = await NewDbAsync();
		var seeded = await SeedAsync(db, PublicationStatus.Scheduled);
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
			await using var secondContext = await NewDbAsync();
			var secondEnqueuer = new JobEnqueuer(secondContext, new RequestAuthContext());
			var act = async () => await secondEnqueuer.EnqueueAsync(
				PublishingJobs.PublishPublicationV1,
				payload,
				new EnqueueOptions { IdempotencyKey = seeded.IdempotencyKey }
			);
			await act.Should().ThrowAsync<DbUpdateException>();

			// A key that does NOT derive from the publication id is refused at enqueue.
			await using var thirdContext = await NewDbAsync();
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
		private readonly SocialSessionResult _result;

		public FakeSocialSessionProvider(SocialSessionResult result) {
			_result = result;
		}

		public Task<SocialSessionResult> OpenSessionAsync(
			Guid socialAccountId,
			CancellationToken cancellationToken
		) {
			return Task.FromResult(_result);
		}
	}

	private sealed class FakePublishProvider : IPublishProvider {
		private readonly PublishResult? _result;
		private readonly List<string> _records = [];

		public FakePublishProvider(PublishResult? result) {
			_result = result;
		}

		public List<PublishRequest> Requests { get; } = [];

		public IReadOnlyList<string> RemoteRecords { get { return _records; } }

		public Task<PublishResult> PublishAsync(
			PublishRequest request,
			CancellationToken cancellationToken
		) {
			Requests.Add(request);

			if (_result is null) {
				throw new InvalidOperationException(
					"FakePublishProvider reached without a configured outcome."
				);
			}

			if (_result is PublishResult.Published or PublishResult.AlreadyExistsTreatedAsPublished) {
				_records.Add(request.IdempotencyKey);
			}

			return Task.FromResult(_result);
		}
	}
}
