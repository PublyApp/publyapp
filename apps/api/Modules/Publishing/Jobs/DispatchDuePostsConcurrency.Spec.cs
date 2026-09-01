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

// Concurrency proof D3.1 (plan §6): two concurrent due scans over 50 past-due
// rows must enqueue EXACTLY ONCE per publication. The claim runs under
// FOR UPDATE SKIP LOCKED inside one transaction and the real IJobEnqueuer
// inserts keyed rows into job_queue, so the partial unique index
// ux_job_queue_type_idempotency backstops the lock against any interleaving.
public sealed class DispatchDuePostsConcurrencySpec : IClassFixture<ApiFixture> {
	private const int RowCount = 50;

	private readonly ApiFixture _fixture;

	public DispatchDuePostsConcurrencySpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	private async Task<string> GetConnectionStringAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		return scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString()
			?? throw new InvalidOperationException(
				"Test database connection string was unexpectedly null."
			);
	}

	[Fact]
	public async Task ItShouldEnqueueEachPastDueRowExactlyOnceAcrossTwoConcurrentScans() {
		var connectionString = await GetConnectionStringAsync();
		await using var seedDb = new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);

		var seededIds = await SeedFiftyPastDueRowsAsync(seedDb);

		// Each scan runs from its OWN DI scope: its own DbContext and the
		// REAL scoped IJobEnqueuer, exactly like two competing workers.
		async Task NewScopeWithJobAsync() {
			var scope = _fixture.Factory.Services.CreateAsyncScope();
			var db =
				scope.ServiceProvider.GetRequiredService<AppDbContext>();
			var enqueuer =
				scope.ServiceProvider.GetRequiredService<IJobEnqueuer>();
			var job = new DispatchDuePostsJob(
				db,
				enqueuer,
				new PublicationStatusTransitionService(db)
			);

			var context = new JobContext {
				JobId = Guid.NewGuid(),
				JobType = DispatchDuePostsJob.JobKey,
				Payload = "{}",
				Attempts = 0,
				MaxAttempts = 3,
				LastError = null,
			};

			await job.HandleAsync(context, CancellationToken.None);
		}

		// Snapshot the keyed row count BEFORE the scans so we can count what the
		// two scans actually added. The previous per-scope probe read the whole
		// JobQueue table for the publishing job type after its own scan, which
		// (a) double-counted any row the other worker had already committed and
		// (b) inherited every stale keyed row a prior run of this spec left in
		// the shared template — so the count assertion could pass with 0 new
		// rows or fail with N+stale under scheduling pressure. The fix measures
		// the delta on the SAME filtered set; the equivalence check still
		// guarantees no duplicates among the new keys.
		await using var snapshotDb = new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
		var beforeCount = await (
			from row in snapshotDb.JobQueue.AsNoTracking()
			where row.JobType == PublishingJobs.PublishPublicationV1.JobType
				&& row.IdempotencyKey != null
			select row.Id
		).CountAsync();

		var scopeTasks = new List<Task> {
			Task.Run(() => NewScopeWithJobAsync()),
			Task.Run(() => NewScopeWithJobAsync()),
		};
		await Task.WhenAll(scopeTasks);

		var expectedKeys = seededIds
			.Select(PublicationIdempotencyKey.For)
			.ToList();
		// Re-read the queue with the same filter as the snapshot, then diff
		// against the pre-scan count and assert the set of new keys covers
		// every past-due row exactly once — the same proof, measured correctly.
		var afterKeys = await (
			from row in snapshotDb.JobQueue.AsNoTracking()
			where row.JobType == PublishingJobs.PublishPublicationV1.JobType
				&& row.IdempotencyKey != null
			select row.IdempotencyKey
		).ToListAsync();
		var newKeysForThisRun = afterKeys
			.Where(key => expectedKeys.Contains(key, StringComparer.Ordinal))
			.ToList();
		newKeysForThisRun.Should().BeEquivalentTo(
			expectedKeys,
			"the two concurrent scans together must enqueue every past-due row exactly once"
		);
		(afterKeys.Count - beforeCount).Should().Be(
			RowCount,
			"the union of both scans added exactly one keyed row per publication "
				+ "(duplicates are impossible via ux_job_queue_type_idempotency)"
		);

		await using var verifyDb = new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
		var remainingScheduled = await (
			from p in verifyDb.Publication.AsNoTracking()
			where p.Id != null && seededIds.Contains(p.Id.Value)
				&& p.Status == PublicationStatus.Scheduled
			select p.Id
		).CountAsync();
		remainingScheduled.Should().Be(
			0,
			"every claimed row must have moved to InProgress"
		);
	}

	private static async Task<List<Guid>> SeedFiftyPastDueRowsAsync(AppDbContext db) {
		var tenant = new PublyApp.Api.Modules.Tenants.Entities.Tenant {
			Name = $"due-conc-{Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = PublyApp.Api.Modules.Tenants.Entities.TenantStatus.Active,
			MaxUsers = 10,
		};
		var user = new User {
			Email = $"due-conc-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true,
		};
		db.Tenant.Add(tenant);
		db.User.Add(user);
		await db.SaveChangesAsync();

		var tenantId = tenant.GetRequiredId();
		var userId = user.GetRequiredId();
		var account = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@conc.bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();

		var scheduledAtUtc = DateTime.UtcNow.AddMinutes(-5);
		var ids = new List<Guid>(RowCount);
		for (var index = 0; index < RowCount; index++) {
			// One post per publication keeps the (post, account) pair unique.
			var post = new Post {
				TenantId = tenantId,
				Body = $"concurrency row {index:00}",
				CreatedByUserId = userId,
			};
			db.Post.Add(post);
			await db.SaveChangesAsync();

			var publication = new Publication {
				TenantId = tenantId,
				PostId = post.GetRequiredId(),
				SocialAccountId = account.GetRequiredId(),
				Status = PublicationStatus.Scheduled,
				ScheduledAtUtc = scheduledAtUtc.AddMilliseconds(index),
				ScheduledTimeZone = "Etc/UTC",
				IdempotencyKey = "pending",
			};
			db.Publication.Add(publication);
			await db.SaveChangesAsync();
			ids.Add(publication.GetRequiredId());
		}

		return ids;
	}
}
