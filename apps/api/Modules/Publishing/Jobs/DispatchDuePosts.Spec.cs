using System.Collections.Concurrent;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Lib;
using PublyApp.Api.Modules.Publishing.Services;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Jobs;

// Direct-invocation integration spec for the due-scan dispatch job (D3 Task 6).
// Real ephemeral Postgres; the enqueue seam is a recording fake IJobEnqueuer and
// Bluesky is NEVER contacted (no IPublishProvider is even resolved here). Pins
// exactly-once keyed enqueue, the Scheduled -> InProgress transition, and the
// untouched rows around it.
public sealed class DispatchDuePostsSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public DispatchDuePostsSpec(ApiFixture fixture) {
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

	private static JobContext NewContext() {
		return new JobContext {
			JobId = Guid.NewGuid(),
			JobType = DispatchDuePostsJob.JobKey,
			Payload = "{}",
			Attempts = 0,
			MaxAttempts = 3,
			LastError = null,
		};
	}

	private sealed record EnqueuedCall(
		Guid PublicationId,
		string PayloadKey,
		string? OptionsKey
	);

	private sealed class RecordingEnqueuer : IJobEnqueuer {
		public ConcurrentBag<EnqueuedCall> Calls { get; } = [];

		public Task<Guid> EnqueueAsync<TPayload>(
			JobDefinition<TPayload> definition,
			TPayload payload,
			EnqueueOptions? options = null,
			CancellationToken cancellationToken = default
		) {
			if (payload is PublishPublicationPayload publishPayload) {
				Calls.Add(new EnqueuedCall(
					publishPayload.PublicationId,
					publishPayload.IdempotencyKey,
					options?.IdempotencyKey
				));
			}

			return Task.FromResult(Guid.NewGuid());
		}
	}

	// Seeds a tenant + post + one account + one publication in the given status
	// at the given instant. Returns the persisted publication id.
	private static async Task<Guid> SeedPublicationAsync(
		AppDbContext db,
		PublicationStatus status,
		DateTime scheduledAtUtc
	) {
		var tenant = new PublyApp.Api.Modules.Tenants.Entities.Tenant {
			Name = $"due-{Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = PublyApp.Api.Modules.Tenants.Entities.TenantStatus.Active,
			MaxUsers = 10,
		};
		var user = new User {
			Email = $"due-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true,
		};
		db.Tenant.Add(tenant);
		db.User.Add(user);
		await db.SaveChangesAsync();

		var tenantId = tenant.GetRequiredId();
		var post = new Post {
			TenantId = tenantId,
			Body = "due scan probe",
			CreatedByUserId = user.GetRequiredId(),
		};
		var account = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@duespec.bsky.social",
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
			ScheduledAtUtc = scheduledAtUtc,
			ScheduledTimeZone = "Etc/UTC",
			IdempotencyKey = PublicationIdempotencyKeyPlaceholder,
		};
		db.Publication.Add(publication);
		await db.SaveChangesAsync();
		return publication.GetRequiredId();
	}

	private const string PublicationIdempotencyKeyPlaceholder = "pending";

	private static DispatchDuePostsJob NewJob(
		AppDbContext db,
		IJobEnqueuer enqueuer
	) {
		return new DispatchDuePostsJob(
			db,
			enqueuer,
			new PublicationStatusTransitionService(db)
		);
	}

	[Fact]
	public async Task ItShouldClaimOnlyPastDueScheduledRowsAndTransitionThem() {
		using var db = await NewDbAsync();
		var pastDue = await SeedPublicationAsync(
			db,
			PublicationStatus.Scheduled,
			DateTime.UtcNow.AddMinutes(-5)
		);
		var future = await SeedPublicationAsync(
			db,
			PublicationStatus.Scheduled,
			DateTime.UtcNow.AddMinutes(30)
		);
		var inProgress = await SeedPublicationAsync(
			db,
			PublicationStatus.InProgress,
			DateTime.UtcNow.AddMinutes(-10)
		);

		var enqueuer = new RecordingEnqueuer();
		var job = NewJob(db, enqueuer);

		var outcome = await job.HandleAsync(NewContext(), CancellationToken.None);

		outcome.Should().Be(JobOutcome.Succeeded);

		var calls = enqueuer.Calls.ToList();
		calls.Should().ContainSingle(
			"exactly one due row exists, so exactly one enqueue must happen"
		);
		calls[0].PublicationId.Should().Be(pastDue);
		calls[0].PayloadKey.Should().Be(
			PublicationIdempotencyKey.For(pastDue)
		);
		calls[0].OptionsKey.Should().Be(
			PublicationIdempotencyKey.For(pastDue),
			"the in-flight dedup key must ride EnqueueOptions too"
		);

		await using var verifyScope =
			_fixture.Factory.Services.CreateAsyncScope();
		var verifyDb =
			verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await verifyDb.Entry(await verifyDb.Publication.SingleAsync(
				p => p.Id == pastDue
			)).ReloadAsync();
		var claimedRow = await verifyDb.Publication.SingleAsync(
			p => p.Id == pastDue
		);
		claimedRow.Status.Should().Be(
			PublicationStatus.InProgress,
			"claiming transitions the row to InProgress via the transition service"
		);

		await verifyDb.Entry(await verifyDb.Publication.SingleAsync(
				p => p.Id == future
			)).ReloadAsync();
		var untouchedFuture = await verifyDb.Publication.SingleAsync(
			p => p.Id == future
		);
		untouchedFuture.Status.Should().Be(PublicationStatus.Scheduled);

		await verifyDb.Entry(await verifyDb.Publication.SingleAsync(
				p => p.Id == inProgress
			)).ReloadAsync();
		var untouchedInProgress = await verifyDb.Publication.SingleAsync(
			p => p.Id == inProgress
		);
		untouchedInProgress.Status.Should().Be(PublicationStatus.InProgress);
		untouchedInProgress.Attempts.Should().Be(0);
	}

	[Fact]
	public async Task ItShouldSucceedWithoutWorkWhenNoRowIsPastDue() {
		using var db = await NewDbAsync();
		_ = await SeedPublicationAsync(
			db,
			PublicationStatus.Scheduled,
			DateTime.UtcNow.AddHours(2)
		);

		var enqueuer = new RecordingEnqueuer();
		var job = NewJob(db, enqueuer);

		var outcome = await job.HandleAsync(NewContext(), CancellationToken.None);

		outcome.Should().Be(JobOutcome.Succeeded);
		enqueuer.Calls.Should().BeEmpty("nothing is due");
	}
}
