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
	public async Task ItShouldEnqueueEachPastDueRowExactlyOnceAcrossTwoConcurrentScans()
	{
		var connectionString = await GetConnectionStringAsync();
		await using var seedDb = new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);

		var seededIds = await SeedFiftyPastDueRowsAsync(seedDb);

		async Task NewScopeWithJobAsync(
			TaskCompletionSource<bool> gate,
			List<string> sink
		) {
			// Each scan runs from its OWN DI scope: its own DbContext and the
			// REAL scoped IJobEnqueuer, exactly like two competing workers.
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

			// Record what THIS scope's own queue rows look like afterwards.
			await using var probe = new AppDbContext(
				new DbContextOptionsBuilder<AppDbContext>()
					.UseNpgsql(connectionString)
					.Options
			);
			var enqueuedKeys = await (
				from row in probe.JobQueue.AsNoTracking()
				where row.JobType == PublishingJobs.PublishPublicationV1.JobType
					&& row.IdempotencyKey != null
				select row.IdempotencyKey
			).ToListAsync();
			sink.AddRange(enqueuedKeys);

			gate.TrySetResult(true);
		}

		var keysWorkerOne = new List<string>();
		var keysWorkerTwo = new List<string>();
		var scopeTasks = new List<Task> {
			Task.Run(() => NewScopeWithJobAsync(
				new TaskCompletionSource<bool>(),
				keysWorkerOne)),
			Task.Run(() => NewScopeWithJobAsync(
				new TaskCompletionSource<bool>(),
				keysWorkerTwo)),
		};
		await Task.WhenAll(scopeTasks);

		var expectedKeys = seededIds
			.Select(PublicationIdempotencyKey.For)
			.OrderBy(key => key, StringComparer.Ordinal)
			.ToList();
		var actualKeys = keysWorkerOne
			.Concat(keysWorkerTwo)
			.Distinct(StringComparer.Ordinal)
			.OrderBy(key => key, StringComparer.Ordinal)
			.ToList();

		actualKeys.Should().BeEquivalentTo(
			expectedKeys,
			"the union of both scans must cover every past-due row exactly once"
		);
		(keysWorkerOne.Count + keysWorkerTwo.Count).Should().Be(
			RowCount,
			"job_queue holds exactly one keyed row per publication "
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
