using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Jobs.Entities;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs;

// A job whose provenance names a tenant runs on a context scoped to that tenant; a job
// with no tenant (platform job) keeps an unscoped context. The handler reads posts with
// NO tenant predicate, so what it sees is the global filter at work.
public sealed class JobTenantScopeSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;

	public JobTenantScopeSpec(ApiFixture fixture) {
		this._Fixture = fixture;
	}

	private sealed class Probe {
		public required string JobType { get; init; }
		public List<Guid> SeenPostIds { get; } = [];
	}

	private sealed class PostReadingHandler(AppDbContext db, Probe probe) : IJobHandler {
		public string JobType {
			get { return probe.JobType; }
		}

		public async Task<JobOutcome> HandleAsync(JobContext context, CancellationToken cancellationToken) {
			var ids = await db.Post.Select(p => p.Id).ToListAsync(cancellationToken);
			probe.SeenPostIds.AddRange(ids.OfType<Guid>());
			return JobOutcome.Succeeded;
		}
	}

	private async Task<AppDbContext> _NewDbAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();
		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was null.");
		}
		return new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connectionString).Options);
	}

	private async Task<List<Guid>> _RunJobAsync(Guid? jobTenantId) {
		var jobType = $"spec.tenant-scope.{Guid.NewGuid():N}";
		var probe = new Probe { JobType = jobType };
		await using var db = await this._NewDbAsync();
		var connectionString = db.Database.GetConnectionString();
		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was null.");
		}

		var services = new ServiceCollection();
		services.AddLogging(logging => logging.ClearProviders());
		services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connectionString));
		services.AddSingleton(probe);
		services.AddScoped<PostReadingHandler>();
		services.AddSingleton(new JobHandlerRegistration(jobType, sp => sp.GetRequiredService<PostReadingHandler>()));
		services.AddSingleton<JobHandlerRegistry>();
		services.AddSingleton<JobWorkerInstance>();
		services.AddSingleton<JobsMetrics>();
		await using var provider = services.BuildServiceProvider();

		await db.JobQueue.AddAsync(new JobQueueItem { JobType = jobType, TenantId = jobTenantId });
		await db.SaveChangesAsync();

		try {
			var processor = new JobQueueProcessor(
				provider.GetRequiredService<IServiceScopeFactory>(),
				provider.GetRequiredService<JobHandlerRegistry>(),
				provider.GetRequiredService<JobsMetrics>(),
				provider.GetRequiredService<JobWorkerInstance>(),
				NullLogger<JobQueueProcessor>.Instance
			);
			var result = await processor.ProcessBatchAsync(CancellationToken.None);
			result.Completed.Should().Be(1);
		} finally {
			await db.Database.ExecuteSqlAsync($"DELETE FROM job_queue WHERE job_type = {jobType}");
		}

		return probe.SeenPostIds;
	}

	[Fact]
	public async Task ItShouldShowAJobScopedToTenantAOnlyTenantAData() {
		await using var seedDb = await this._NewDbAsync();
		var (tenantA, postA) = await AppDbContextTenantFilterSpec.SeedAsync(seedDb);
		var (_, postB) = await AppDbContextTenantFilterSpec.SeedAsync(seedDb);

		var seen = await this._RunJobAsync(tenantA);

		seen.Should().Contain(postA).And.NotContain(postB);
	}

	[Fact]
	public async Task ItShouldKeepAnUnscopedContextForAJobWithoutATenant() {
		await using var seedDb = await this._NewDbAsync();
		var (_, postA) = await AppDbContextTenantFilterSpec.SeedAsync(seedDb);
		var (_, postB) = await AppDbContextTenantFilterSpec.SeedAsync(seedDb);

		var seen = await this._RunJobAsync(null);

		seen.Should().Contain(postA).And.Contain(postB);
	}
}
