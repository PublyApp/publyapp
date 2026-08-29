using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Jobs.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Jobs.Services;

// Direct-service specs over the fixture database (#636 staff jobs dashboard).
// Rows are seeded through raw SQL because job_queue timestamps are
// database-generated (F11) and these tests need deterministic created_at
// ordering for the keyset assertions.
public sealed class JobQueueQueryServiceSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public JobQueueQueryServiceSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldListQueueItemsInCreatedAtDescOrder() {
		var jobType = NewJobType("order");

		try {
			await SeedRowAsync(jobType, minutesAgo: 30, status: JobQueueStatus.Pending);
			await SeedRowAsync(jobType, minutesAgo: 20, status: JobQueueStatus.Pending);
			await SeedRowAsync(jobType, minutesAgo: 10, status: JobQueueStatus.Pending);

			var service = await CreateServiceAsync();
			var result = await service.FindAsync(new FindJobQueueItemsArgs(
				Cursor: Guid.Empty,
				Limit: 10,
				TenantId: null,
				StatusCsv: null,
				JobType: jobType
			));

			var page = result.Should().BeOfType<FindJobQueueItemsResult.Success>()
				.Subject.Data;
			page.Data.Should().HaveCount(3);
			page.NextCursor.Should().BeNull();
			page.Data.Select(row => row.CreatedAt)
				.Should().BeInDescendingOrder();
			page.Data.Last().JobType.Should().Be(jobType);
		} finally {
			await CleanupAsync(jobType);
		}
	}

	[Fact]
	public async Task ItShouldFilterByStatusCsv() {
		var jobType = NewJobType("status");

		try {
			var pendingA = await SeedRowAsync(
				jobType, minutesAgo: 30, status: JobQueueStatus.Pending
			);
			var pendingB = await SeedRowAsync(
				jobType, minutesAgo: 20, status: JobQueueStatus.Pending
			);
			await SeedRowAsync(jobType, minutesAgo: 10, status: JobQueueStatus.Processing);

			var service = await CreateServiceAsync();
			var result = await service.FindAsync(new FindJobQueueItemsArgs(
				Cursor: Guid.Empty,
				Limit: 10,
				TenantId: null,
				StatusCsv: "pending",
				JobType: jobType
			));

			var page = result.Should().BeOfType<FindJobQueueItemsResult.Success>()
				.Subject.Data;
			page.Data.Select(row => row.Id).Should().BeEquivalentTo(
				[pendingA, pendingB]
			);

			var rejected = await service.FindAsync(new FindJobQueueItemsArgs(
				Cursor: Guid.Empty,
				Limit: 10,
				TenantId: null,
				StatusCsv: "not-a-status",
				JobType: jobType
			));
			rejected.Should()
				.BeOfType<FindJobQueueItemsResult.InvalidStatusCsv>();
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
			await SeedRowAsync(
				jobType, minutesAgo: 30, status: JobQueueStatus.Pending,
				tenantId: tenantId
			);
			await SeedRowAsync(jobType, minutesAgo: 20, status: JobQueueStatus.Pending);
			await SeedRowAsync(otherJobType, minutesAgo: 10, status: JobQueueStatus.Pending);

			var service = await CreateServiceAsync();
			var result = await service.FindAsync(new FindJobQueueItemsArgs(
				Cursor: Guid.Empty,
				Limit: 10,
				TenantId: tenantId,
				StatusCsv: null,
				JobType: jobType
			));

			var page = result.Should().BeOfType<FindJobQueueItemsResult.Success>()
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
	public async Task ItShouldKeysetPaginateOnCreatedAt() {
		var jobType = NewJobType("keyset");

		try {
			var seeded = new List<(Guid Id, int MinutesAgo)>();
			for (var index = 0; index < 5; index++) {
				var id = await SeedRowAsync(
					jobType, minutesAgo: 50 - (index * 10),
					status: JobQueueStatus.Pending
				);
				seeded.Add((id, 50 - (index * 10)));
			}

			var expectedNewestFirst = seeded
				.OrderByDescending(row => row.MinutesAgo * -1)
				.Select(row => row.Id)
				.ToList();

			var visited = new List<Guid>();
			Guid cursor = Guid.Empty;
			while (true) {
				var service = await CreateServiceAsync();
				var result = await service.FindAsync(new FindJobQueueItemsArgs(
					Cursor: cursor,
					Limit: 2,
					TenantId: null,
					StatusCsv: null,
					JobType: jobType
				));
				var page = result.Should()
					.BeOfType<FindJobQueueItemsResult.Success>().Subject.Data;
				visited.AddRange(page.Data.Select(row => row.Id));
				if (page.NextCursor is null) {
					break;
				}

				cursor = Guid.Parse(page.NextCursor);
			}

			visited.Should().HaveCount(5);
			visited.Should().BeEquivalentTo(expectedNewestFirst);
			visited.Should().OnlyHaveUniqueItems();
		} finally {
			await CleanupAsync(jobType);
		}
	}

	[Fact]
	public async Task ItShouldGetOneById() {
		var jobType = NewJobType("get-one");
		var tenantId = Guid.NewGuid();

		try {
			var id = await SeedRowAsync(
				jobType, minutesAgo: 15, status: JobQueueStatus.Pending,
				tenantId: tenantId
			);

			var service = await CreateServiceAsync();
			var detail = await service.GetByIdAsync(id);

			detail.Should().NotBeNull();
			detail!.Id.Should().Be(id);
			detail.JobType.Should().Be(jobType);
			detail.TenantId.Should().Be(tenantId);
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

	private async Task<JobQueueQueryService> CreateServiceAsync() {
		var dbContext = await CreateDbContextAsync();
		return new JobQueueQueryService(dbContext);
	}

	private async Task<Guid> SeedRowAsync(
		string jobType,
		int minutesAgo,
		JobQueueStatus status,
		Guid? tenantId = null
	) {
		var id = Guid.NewGuid();
		var payload = "{}";
		await using var dbContext = await CreateDbContextAsync();
		await dbContext.Database.ExecuteSqlAsync(
			$"""
			INSERT INTO job_queue (
				id, job_type, payload, status, priority, attempts, max_attempts,
				next_attempt_at, tenant_id, created_at, updated_at
			)
			VALUES (
				{id}, {jobType}, {payload}::jsonb, {(int)status}, 100, 0, 10,
				now(), {tenantId},
				now() - make_interval(mins => {minutesAgo}),
				now() - make_interval(mins => {minutesAgo})
			)
			"""
		);
		return id;
	}

	private async Task CleanupAsync(string jobType) {
		await using var dbContext = await CreateDbContextAsync();
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_queue WHERE job_type = {jobType}"
		);
	}

	private static string NewJobType(string suffix) {
		return $"spec.jq.{suffix}.{Guid.NewGuid():N}";
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
