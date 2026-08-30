using System.Diagnostics;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Publishing.Jobs;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs;

// The trusted enqueue boundary (F15): envelope + provenance stamping, transaction
// joining, per-type idempotency scoping (F13), and empty-ID rejection (F2). Each test
// uses unique job types and cleans up its own rows.
public sealed class JobEnqueuerSpec : IClassFixture<ApiFixture> {
	private sealed record ExportPayload {
		public required Guid TargetId { get; init; }
	}

	private readonly ApiFixture _fixture;

	public JobEnqueuerSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldPersistTheFullEnvelopeWithProvenanceAndDatabaseTimestamps() {
		var definition = NewDefinition("envelope", priority: 100, maxAttempts: 5);
		var userId = Guid.NewGuid();
		var tenantId = Guid.NewGuid();

		try {
			await using var dbContext = await CreateDbContextAsync();
			var enqueuer = new JobEnqueuer(dbContext, new RequestAuthContext {
				SessionToken = "spec-session",
				UserId = userId,
				TenantId = tenantId.ToString()
			});

			using var activity = new Activity("spec-enqueue").Start();
			var payload = new ExportPayload { TargetId = Guid.NewGuid() };

			var jobId = await enqueuer.EnqueueAsync(
				definition, payload, new EnqueueOptions { IdempotencyKey = "k-1" }
			);

			await using var verifyContext = await CreateDbContextAsync();
			var row = await verifyContext.JobQueue.SingleAsync(j => j.Id == jobId);

			row.JobType.Should().Be(definition.JobType);
			row.Payload.Should().Contain("\"targetId\"", "payloads use the canonical camelCase wire form");
			row.Priority.Should().Be(100);
			row.MaxAttempts.Should().Be(5);
			row.IdempotencyKey.Should().Be("k-1");
			row.TenantId.Should().Be(tenantId);
			row.ActorUserId.Should().Be(userId);
			row.CorrelationId.Should().Be(activity.Id);
			// F11: timestamps come from database defaults, never app initializers.
			row.CreatedAt.Should().NotBe(default);
			row.NextAttemptAt.Should().NotBe(default);
			row.Status.Should().Be(Modules.Jobs.Entities.JobQueueStatus.Pending);
		} finally {
			await DeleteJobsByTypeAsync(definition.JobType);
		}
	}

	[Fact]
	public async Task ItShouldJoinTheCallersTransactionAndRollBackWithIt() {
		var definition = NewDefinition("txn");

		try {
			await using var dbContext = await CreateDbContextAsync();
			var enqueuer = new JobEnqueuer(dbContext, new RequestAuthContext());

			Guid jobId;
			await using (var transaction = await dbContext.Database.BeginTransactionAsync()) {
				jobId = await enqueuer.EnqueueAsync(
					definition, new ExportPayload { TargetId = Guid.NewGuid() }
				);

				// The enqueuer must JOIN the ambient transaction, never commit or
				// replace it: it is still open and still the caller's to decide.
				dbContext.Database.CurrentTransaction.Should().BeSameAs(transaction);

				await transaction.RollbackAsync();
			}

			await using var verifyContext = await CreateDbContextAsync();
			var row = await verifyContext.JobQueue.SingleOrDefaultAsync(j => j.Id == jobId);
			row.Should().BeNull("a rolled-back domain transaction takes its job with it");
		} finally {
			await DeleteJobsByTypeAsync(definition.JobType);
		}
	}

	[Fact]
	public async Task ItShouldDedupOnJobTypePlusIdempotencyKey() {
		var definition = NewDefinition("dedup");

		try {
			await using var dbContext = await CreateDbContextAsync();
			var enqueuer = new JobEnqueuer(dbContext, new RequestAuthContext());
			var options = new EnqueueOptions { IdempotencyKey = "same-key" };

			await enqueuer.EnqueueAsync(
				definition, new ExportPayload { TargetId = Guid.NewGuid() }, options
			);

			// Same (job_type, key) while the first is in flight → unique violation.
			await using var secondContext = await CreateDbContextAsync();
			var secondEnqueuer = new JobEnqueuer(secondContext, new RequestAuthContext());
			var act = async () => await secondEnqueuer.EnqueueAsync(
				definition, new ExportPayload { TargetId = Guid.NewGuid() }, options
			);

			await act.Should().ThrowAsync<DbUpdateException>();

			await using var verifyContext = await CreateDbContextAsync();
			var count = await verifyContext.JobQueue
				.CountAsync(j => j.JobType == definition.JobType);
			count.Should().Be(1);
		} finally {
			await DeleteJobsByTypeAsync(definition.JobType);
		}
	}

	[Fact]
	public async Task ItShouldAllowTheSameIdempotencyKeyAcrossDifferentJobTypes() {
		var definitionA = NewDefinition("scope-a");
		var definitionB = NewDefinition("scope-b");

		try {
			await using var dbContext = await CreateDbContextAsync();
			var enqueuer = new JobEnqueuer(dbContext, new RequestAuthContext());
			var options = new EnqueueOptions { IdempotencyKey = "shared-key" };

			// F13: scoping to (job_type, key) means unrelated job types can never
			// collide on a key.
			await enqueuer.EnqueueAsync(
				definitionA, new ExportPayload { TargetId = Guid.NewGuid() }, options
			);
			await enqueuer.EnqueueAsync(
				definitionB, new ExportPayload { TargetId = Guid.NewGuid() }, options
			);

			await using var verifyContext = await CreateDbContextAsync();
			var countA = await verifyContext.JobQueue
				.CountAsync(j => j.JobType == definitionA.JobType);
			var countB = await verifyContext.JobQueue
				.CountAsync(j => j.JobType == definitionB.JobType);
			countA.Should().Be(1);
			countB.Should().Be(1);
		} finally {
			await DeleteJobsByTypeAsync(definitionA.JobType);
			await DeleteJobsByTypeAsync(definitionB.JobType);
		}
	}

	[Fact]
	public async Task ItShouldRejectAnEmptyGuidPayloadWithoutPersistingAnything() {
		var definition = NewDefinition("empty-id");

		try {
			await using var dbContext = await CreateDbContextAsync();
			var enqueuer = new JobEnqueuer(dbContext, new RequestAuthContext());

			var act = async () => await enqueuer.EnqueueAsync(
				definition, new ExportPayload { TargetId = Guid.Empty }
			);

			// F2: a job that could never execute is refused before it is persisted.
			await act.Should().ThrowAsync<InvalidOperationException>()
				.WithMessage("*TargetId*Guid.Empty*");

			await using var verifyContext = await CreateDbContextAsync();
			var count = await verifyContext.JobQueue
				.CountAsync(j => j.JobType == definition.JobType);
			count.Should().Be(0);
		} finally {
			await DeleteJobsByTypeAsync(definition.JobType);
		}
	}

	// #1717 part 2: PublishPublicationPayload.IdempotencyKey is a redundant copy of
	// the derived key, but the redundancy is NOT silent — the definition's Validate
	// hook fires inside JobEnqueuer.EnqueueAsync and rejects a payload whose key
	// diverges from the key derived from the publication id. A reader who edits the
	// payload field gets a loud failure instead of silently diverging from the
	// EnqueueOptions key the queue dedups on.
	[Fact]
	public async Task ItShouldRejectEnqueueWhenPublishingPayloadIdempotencyKeyMismatchesTheDerivedKey() {
		var publicationId = Guid.CreateVersion7();
		var wrongKey = "not-the-derived-key";

		try {
			await using var dbContext = await CreateDbContextAsync();
			var enqueuer = new JobEnqueuer(dbContext, new RequestAuthContext());

			var act = async () => await enqueuer.EnqueueAsync(
				PublishingJobs.PublishPublicationV1,
				new PublishPublicationPayload {
					PublicationId = publicationId,
					IdempotencyKey = wrongKey,
				}
			);

			// The payload key is READ at enqueue: a mismatch is refused loudly, so
			// the field can never silently mislead a reader into thinking it drives
			// idempotency on its own.
			await act.Should().ThrowAsync<InvalidOperationException>()
				.WithMessage("*does not match the key derived from the publication id*");

			await using var verifyContext = await CreateDbContextAsync();
			var count = await verifyContext.JobQueue
				.CountAsync(j => j.JobType == PublishingJobs.PublishPublicationV1JobType);
			count.Should().Be(0, "a rejected payload must not be persisted");
		} finally {
			await DeleteJobsByTypeAsync(PublishingJobs.PublishPublicationV1JobType);
		}
	}

	// With NO ambient transaction the enqueuer owns one of its own, committing the
	// insert and the pg_notify TOGETHER (review finding 3): the wake is delivered at
	// commit — observed here by a real LISTEN connection — and a NOTIFY failure
	// could never strand a durably-committed row behind a caller-visible exception.
	[Fact]
	public async Task ItShouldCommitInsertAndNotifyAtomicallyWhenItOwnsTheTransaction() {
		var definition = NewDefinition("own-txn-notify");

		try {
			var connectionString = await GetConnectionStringAsync();

			await using var listenConnection =
				new Npgsql.NpgsqlConnection(connectionString);
			await listenConnection.OpenAsync();

			var notified = new TaskCompletionSource(
				TaskCreationOptions.RunContinuationsAsynchronously
			);
			listenConnection.Notification += (_, args) => {
				if (args.Channel == "job_queue") {
					notified.TrySetResult();
				}
			};

			await using (var listen = new Npgsql.NpgsqlCommand(
				"LISTEN job_queue", listenConnection
			)) {
				await listen.ExecuteNonQueryAsync();
			}

			await using var dbContext = await CreateDbContextAsync();
			var enqueuer = new JobEnqueuer(dbContext, new RequestAuthContext());

			dbContext.Database.CurrentTransaction.Should().BeNull(
				"this spec exercises the enqueuer-owned transaction path"
			);

			var jobId = await enqueuer.EnqueueAsync(
				definition, new ExportPayload { TargetId = Guid.NewGuid() }
			);

			// Drive the listener until the at-commit notification arrives.
			using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
			while (!notified.Task.IsCompleted) {
				await listenConnection.WaitAsync(timeout.Token);
			}
			await notified.Task;

			// And the row itself is durably committed and visible elsewhere.
			await using var verifyContext = await CreateDbContextAsync();
			var row = await verifyContext.JobQueue.SingleOrDefaultAsync(j => j.Id == jobId);
			row.Should().NotBeNull();
		} finally {
			await DeleteJobsByTypeAsync(definition.JobType);
		}
	}

	// --- helpers ----------------------------------------------------------------

	private static JobDefinition<ExportPayload> NewDefinition(
		string prefix,
		int priority = 0,
		int maxAttempts = 10
	) {
		return new JobDefinition<ExportPayload> {
			JobType = $"spec.enqueue.{prefix}.{Guid.NewGuid():N}.v1",
			Priority = priority,
			MaxAttempts = maxAttempts
		};
	}

	private async Task DeleteJobsByTypeAsync(string jobType) {
		await using var dbContext = await CreateDbContextAsync();
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_queue WHERE job_type = {jobType}"
		);
	}

	private async Task<string> GetConnectionStringAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException(
				"Test database connection string was unexpectedly null."
			);
		}

		return connectionString;
	}

	private async Task<AppDbContext> CreateDbContextAsync() {
		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(await GetConnectionStringAsync())
				.Options
		);
	}
}
