using System.Diagnostics;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Testing.Fixtures;

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

	private async Task<AppDbContext> CreateDbContextAsync() {
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
}
