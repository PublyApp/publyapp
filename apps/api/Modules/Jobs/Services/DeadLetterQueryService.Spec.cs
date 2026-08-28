using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Jobs.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Jobs.Services;

// Direct-service specs over the fixture database (#636 staff jobs dashboard).
// Rows are seeded through raw SQL because job_dead_letter timestamps are
// database-generated (F11) and these tests need deterministic failed_at
// ordering for the keyset assertions.
public sealed class DeadLetterQueryServiceSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public DeadLetterQueryServiceSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldListDeadLetterRowsInFailedAtDescOrder() {
		var jobType = NewJobType("order");

		try {
			await SeedRowAsync(jobType, minutesAgo: 30);
			await SeedRowAsync(jobType, minutesAgo: 20);
			await SeedRowAsync(jobType, minutesAgo: 10);

			var service = await CreateServiceAsync();
			var result = await service.FindAsync(new FindDeadLetterItemsArgs(
				Cursor: Guid.Empty,
				Limit: 10,
				TenantId: null,
				ExternalStateStatusCsv: null,
				JobType: jobType
			));

			var page = result.Should().BeOfType<FindDeadLetterItemsResult.Success>()
				.Subject.Data;
			page.Data.Should().HaveCount(3);
			page.NextCursor.Should().BeNull();
			page.Data.Select(row => row.FailedAt)
				.Should().BeInDescendingOrder();
		} finally {
			await CleanupAsync(jobType);
		}
	}

	[Fact]
	public async Task ItShouldFilterByExternalStateStatusCsv() {
		var jobType = NewJobType("status");

		try {
			var unclassifiedA = await SeedRowAsync(
				jobType, minutesAgo: 30, externalStateStatus: 6
			);
			var unclassifiedB = await SeedRowAsync(
				jobType, minutesAgo: 20, externalStateStatus: 6
			);
			await SeedRowAsync(jobType, minutesAgo: 10, externalStateStatus: 0);

			var service = await CreateServiceAsync();
			var result = await service.FindAsync(new FindDeadLetterItemsArgs(
				Cursor: Guid.Empty,
				Limit: 10,
				TenantId: null,
				ExternalStateStatusCsv: "6",
				JobType: jobType
			));

			var page = result.Should().BeOfType<FindDeadLetterItemsResult.Success>()
				.Subject.Data;
			page.Data.Select(row => row.Id).Should().BeEquivalentTo(
				[unclassifiedA, unclassifiedB]
			);

			var rejected = await service.FindAsync(new FindDeadLetterItemsArgs(
				Cursor: Guid.Empty,
				Limit: 10,
				TenantId: null,
				ExternalStateStatusCsv: "99",
				JobType: jobType
			));
			rejected.Should()
				.BeOfType<FindDeadLetterItemsResult.InvalidStatusCsv>();
		} finally {
			await CleanupAsync(jobType);
		}
	}

	[Fact]
	public async Task ItShouldFilterByJobTypeAndTenantId() {
		var jobType = NewJobType("filters");
		var otherJobType = NewJobType("other");
		var tenantId = Guid.NewGuid();

		try {
			await SeedRowAsync(jobType, minutesAgo: 30, tenantId: tenantId);
			await SeedRowAsync(jobType, minutesAgo: 20);
			await SeedRowAsync(otherJobType, minutesAgo: 10, tenantId: tenantId);

			var service = await CreateServiceAsync();
			var result = await service.FindAsync(new FindDeadLetterItemsArgs(
				Cursor: Guid.Empty,
				Limit: 10,
				TenantId: tenantId,
				ExternalStateStatusCsv: null,
				JobType: jobType
			));

			var page = result.Should().BeOfType<FindDeadLetterItemsResult.Success>()
				.Subject.Data;
			page.Data.Should().ContainSingle();
			page.Data.Single().TenantId.Should().Be(tenantId);
			page.Data.Single().JobType.Should().Be(jobType);
		} finally {
			await CleanupAsync(jobType);
			await CleanupAsync(otherJobType);
		}
	}

	[Fact]
	public async Task ItShouldKeysetPaginateOnFailedAt() {
		var jobType = NewJobType("keyset");

		try {
			var seeded = new List<Guid>();
			for (var index = 0; index < 5; index++) {
				seeded.Add(await SeedRowAsync(
					jobType, minutesAgo: 50 - (index * 10)
				));
			}

			var visited = new List<Guid>();
			Guid cursor = Guid.Empty;
			while (true) {
				var service = await CreateServiceAsync();
				var result = await service.FindAsync(new FindDeadLetterItemsArgs(
					Cursor: cursor,
					Limit: 2,
					TenantId: null,
					ExternalStateStatusCsv: null,
					JobType: jobType
				));
				var page = result.Should()
					.BeOfType<FindDeadLetterItemsResult.Success>().Subject.Data;
				visited.AddRange(page.Data.Select(row => row.Id));
				if (page.NextCursor is null) {
					break;
				}

				cursor = Guid.Parse(page.NextCursor);
			}

			visited.Should().HaveCount(5);
			visited.Should().OnlyHaveUniqueItems();
		} finally {
			await CleanupAsync(jobType);
		}
	}

	[Fact]
	public async Task ItShouldGetOneByIdWithEvents() {
		var jobType = NewJobType("get-one");
		var tenantId = Guid.NewGuid();

		try {
			var id = await SeedRowAsync(
				jobType, minutesAgo: 15, tenantId: tenantId, externalStateStatus: 6
			);
			await using var dbContext = await CreateDbContextAsync();
			dbContext.JobDeadLetterEvent.Add(new JobDeadLetterEvent {
				DeadLetterId = id,
				Event = JobDeadLetterEvents.MissingConfirmed,
				DetectedBy = "operator",
				PriorStatus = 6,
				NewStatus = 4,
				OccurredAt = DateTime.UtcNow,
			});
			await dbContext.SaveChangesAsync();

			var service = await CreateServiceAsync();
			var detail = await service.GetByIdAsync(id);

			detail.Should().NotBeNull();
			detail!.Id.Should().Be(id);
			detail.TenantId.Should().Be(tenantId);
			detail.Events.Should().ContainSingle();
			detail.Events.Single().Event.Should()
				.Be(JobDeadLetterEvents.MissingConfirmed);
		} finally {
			await CleanupAsync(jobType);
		}
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForUnknownId() {
		var service = await CreateServiceAsync();

		var detail = await service.GetByIdAsync(Guid.NewGuid());

		detail.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldRequeueAnExistingRowInsertingOneJobQueueRowAndOneEvent() {
		var jobType = NewJobType("requeue");
		var originalJobId = Guid.NewGuid();

		try {
			var deadLetterId = await SeedRowAsync(
				jobType, minutesAgo: 25, originalJobId: originalJobId
			);

			var service = await CreateServiceAsync();
			var result = await service.RequeueAsync(
				new RequeueDeadLetterArgs(deadLetterId)
			);

			var requeued = result.Should()
				.BeOfType<RequeueDeadLetterResult.Requeued>().Subject;
			requeued.OriginalJobId.Should().Be(originalJobId);
			requeued.NewJobId.Should().NotBe(originalJobId);

			await using var verify = await CreateDbContextAsync();
			var queueRows = await verify.JobQueue
				.Where(row => row.RequeuedFromDeadLetterId == deadLetterId)
				.ToListAsync();
			queueRows.Should().ContainSingle();
			queueRows.Single().Id.Should().Be(requeued.NewJobId);
			queueRows.Single().JobType.Should().Be(jobType);
			queueRows.Single().Attempts.Should().Be(0);

			var letter = await verify.JobDeadLetter
				.SingleAsync(row => row.Id == deadLetterId);
			letter.RequeuedAsJobId.Should().Be(requeued.NewJobId);
			letter.RequeuedAt.Should().NotBeNull();

			var events = await verify.JobDeadLetterEvent
				.Where(row => row.DeadLetterId == deadLetterId)
				.ToListAsync();
			events.Should().ContainSingle();
			events.Single().Event.Should().Be(JobDeadLetterEvents.Requeued);
		} finally {
			await CleanupAsync(jobType);
		}
	}

	[Fact]
	public async Task ItShouldLoseTheRequeueRaceCleanlyOnDoubleRequeue() {
		var jobType = NewJobType("double-requeue");

		try {
			var deadLetterId = await SeedRowAsync(jobType, minutesAgo: 25);

			var first = await CreateServiceAsync();
			var second = await CreateServiceAsync();

			var firstResult = await first.RequeueAsync(
				new RequeueDeadLetterArgs(deadLetterId)
			);
			firstResult.Should()
				.BeOfType<RequeueDeadLetterResult.Requeued>();

			var secondResult = await second.RequeueAsync(
				new RequeueDeadLetterArgs(deadLetterId)
			);
			secondResult.Should()
				.BeOfType<RequeueDeadLetterResult.AlreadyRequeued>();

			await using var verify = await CreateDbContextAsync();
			(await verify.JobQueue.CountAsync(
				row => row.RequeuedFromDeadLetterId == deadLetterId
			)).Should().Be(1);
			(await verify.JobDeadLetterEvent.CountAsync(
				row => row.DeadLetterId == deadLetterId
					&& row.Event == JobDeadLetterEvents.Requeued
			)).Should().Be(1);
		} finally {
			await CleanupAsync(jobType);
		}
	}

	private async Task<DeadLetterQueryService> CreateServiceAsync() {
		var dbContext = await CreateDbContextAsync();
		return new DeadLetterQueryService(dbContext);
	}

	private async Task<Guid> SeedRowAsync(
		string jobType,
		int minutesAgo,
		Guid? tenantId = null,
		int externalStateStatus = 0,
		Guid? originalJobId = null
	) {
		var id = Guid.NewGuid();
		var payload = "{}";
		// ck_job_dead_letter_external_state_bounds: statuses 1,2,4,5,6 carry
		// recorded bounds; 0 and 3 keep all three columns NULL.
		var needsBounds = externalStateStatus is not (0 or 3);
		await using var dbContext = await CreateDbContextAsync();
		if (needsBounds) {
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				INSERT INTO job_dead_letter (
					id, original_job_id, job_type, payload, priority, max_attempts,
					attempts, tenant_id, enqueued_at, external_state_status,
					external_state_prepared_at, external_state_expires_at,
					failed_at, created_at
				)
				VALUES (
					{id}, {originalJobId ?? Guid.NewGuid()}, {jobType},
					{payload}::jsonb, 100, 10, 10, {tenantId},
					now() - make_interval(mins => {minutesAgo + 5}),
					{externalStateStatus},
					now() - make_interval(mins => {minutesAgo + 2}),
					now() - make_interval(mins => {minutesAgo}),
					now() - make_interval(mins => {minutesAgo}),
					now() - make_interval(mins => {minutesAgo})
				)
				"""
			);
		} else {
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				INSERT INTO job_dead_letter (
					id, original_job_id, job_type, payload, priority, max_attempts,
					attempts, tenant_id, enqueued_at, external_state_status,
					failed_at, created_at
				)
				VALUES (
					{id}, {originalJobId ?? Guid.NewGuid()}, {jobType},
					{payload}::jsonb, 100, 10, 10, {tenantId},
					now() - make_interval(mins => {minutesAgo + 5}),
					{externalStateStatus},
					now() - make_interval(mins => {minutesAgo}),
					now() - make_interval(mins => {minutesAgo})
				)
				"""
			);
		}

		return id;
	}

	private async Task CleanupAsync(string jobType) {
		await using var dbContext = await CreateDbContextAsync();
		await dbContext.Database.ExecuteSqlAsync(
			$"""
			DELETE FROM job_dead_letter_events
			WHERE dead_letter_id IN (
				SELECT id FROM job_dead_letter WHERE job_type = {jobType}
			)
			"""
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_queue WHERE job_type = {jobType}"
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_dead_letter WHERE job_type = {jobType}"
		);
	}

	private static string NewJobType(string suffix) {
		return $"spec.dlq.{suffix}.{Guid.NewGuid():N}";
	}

	private async Task<AppDbContext> CreateDbContextAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was null.");
		}

		var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connectionString);
		return new AppDbContext(options.Options);
	}
}
