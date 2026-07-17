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

// The review-1 blocker contract: handlers register SCOPED (injecting AppDbContext
// like any domain service), the registry holds registrations (types/factories), and
// the engine resolves the handler AND its transition AppDbContext from ONE fresh
// scope per job — so DI scope validation passes and the terminal-failure hook's
// writes share the engine's DLQ transaction. Proven against a real, scope-validated
// ServiceProvider built the way JobsServiceRegistration.AddJobHandler wires things.
public sealed class JobHandlerScopingSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public JobHandlerScopingSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldResolveAScopedHandlerFromAFreshScopePerJobUnderDiValidation() {
		var jobType = UniqueType("scoping");
		var collector = new ScopeProbeCollector { JobType = jobType };

		// ValidateOnBuild + ValidateScopes: a root-captured scoped dependency (the
		// old instance-holding registry design) fails HERE, at build time.
		await using var provider = await BuildValidatedProviderAsync(
			collector,
			services => services.AddScoped<ScopedProbeHandler>(),
			new JobHandlerRegistration(
				jobType, sp => sp.GetRequiredService<ScopedProbeHandler>()
			)
		);

		await using var seedContext = await CreateDbContextAsync();
		var seededIds = await SeedDueJobsAsync(seedContext, jobType, count: 2);

		try {
			var processor = CreateProcessor(provider);

			var result = await processor.ProcessBatchAsync(CancellationToken.None);

			result.Dispatched.Should().Be(2);
			result.Completed.Should().Be(2);

			// Fresh scope per job: two jobs saw two DISTINCT handler instances and
			// two DISTINCT scoped AppDbContext instances.
			collector.HandlerInstances.Should().HaveCount(2);
			collector.HandlerInstances.Distinct().Should().HaveCount(2);
			collector.ContextInstances.Distinct().Should().HaveCount(2);

			await using var verifyContext = await CreateDbContextAsync();
			var remaining = await verifyContext.JobQueue
				.CountAsync(j => j.JobType == jobType);
			remaining.Should().Be(0);
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	[Fact]
	public async Task ItShouldCommitTheHooksScopedDbContextWritesWithTheTerminalTransaction() {
		var jobType = UniqueType("hook-commit");
		var collector = new ScopeProbeCollector {
			JobType = jobType,
			MarkerType = UniqueType("hook-marker")
		};

		await using var provider = await BuildValidatedProviderAsync(
			collector,
			services => services.AddScoped<ScopedTerminalHandler>(),
			new JobHandlerRegistration(
				jobType, sp => sp.GetRequiredService<ScopedTerminalHandler>()
			)
		);

		await using var seedContext = await CreateDbContextAsync();
		var seededIds = await SeedDueJobsAsync(seedContext, jobType, count: 1);
		var jobId = seededIds.Single();

		try {
			var processor = CreateProcessor(provider);

			await processor.ProcessBatchAsync(CancellationToken.None);

			await using var verifyContext = await CreateDbContextAsync();

			// The engine's DLQ row and the hook's own scoped-context write (the
			// marker) committed together with the queue delete.
			var engineRow = await verifyContext.JobDeadLetter
				.SingleOrDefaultAsync(d => d.OriginalJobId == jobId && d.JobType == jobType);
			engineRow.Should().NotBeNull();

			var markerCount = await verifyContext.JobDeadLetter
				.CountAsync(d => d.JobType == collector.MarkerType);
			markerCount.Should().Be(
				1, "the hook's write on its injected scoped context committed with "
				+ "the terminal transaction"
			);

			var queueCount = await verifyContext.JobQueue
				.CountAsync(j => j.JobType == jobType);
			queueCount.Should().Be(0);
		} finally {
			await DeleteJobsByTypeAsync(jobType);
			await DeleteJobsByTypeAsync(collector.MarkerType);
		}
	}

	[Fact]
	public async Task ItShouldRollBackTheHooksScopedDbContextWritesWhenTheTerminalStepFails() {
		var jobType = UniqueType("hook-rollback");
		var collector = new ScopeProbeCollector {
			JobType = jobType,
			MarkerType = UniqueType("rollback-marker"),
			ThrowAfterMarkerWrite = true
		};

		await using var provider = await BuildValidatedProviderAsync(
			collector,
			services => services.AddScoped<ScopedTerminalHandler>(),
			new JobHandlerRegistration(
				jobType, sp => sp.GetRequiredService<ScopedTerminalHandler>()
			)
		);

		await using var seedContext = await CreateDbContextAsync();
		var seededIds = await SeedDueJobsAsync(seedContext, jobType, count: 1);
		var jobId = seededIds.Single();

		try {
			var processor = CreateProcessor(provider);

			await processor.ProcessBatchAsync(CancellationToken.None);

			await using var verifyContext = await CreateDbContextAsync();

			// The hook FLUSHED its marker (SaveChanges inside the engine's open
			// transaction) and then threw: the rollback must take the marker, the
			// engine's DLQ copy, and the queue delete with it — proving the hook's
			// scoped context and the engine share ONE transaction.
			var markerCount = await verifyContext.JobDeadLetter
				.CountAsync(d => d.JobType == collector.MarkerType);
			markerCount.Should().Be(0, "the hook's flushed write rolled back");

			var dlqCount = await verifyContext.JobDeadLetter
				.CountAsync(d => d.JobType == jobType);
			dlqCount.Should().Be(0);

			var queueRow = await verifyContext.JobQueue
				.SingleAsync(j => j.Id == jobId);
			queueRow.Status.Should().Be(
				JobQueueStatus.Processing,
				"the still-leased row is retried whole after lease expiry"
			);
		} finally {
			await DeleteJobsByTypeAsync(jobType);
			await DeleteJobsByTypeAsync(collector.MarkerType);
		}
	}

	// --- helpers ----------------------------------------------------------------

	// Builds a scope-validated provider wired exactly like
	// JobsServiceRegistration.AddJobHandler + AddWorkerServices would wire it.
	private async Task<ServiceProvider> BuildValidatedProviderAsync(
		ScopeProbeCollector collector,
		Action<IServiceCollection> registerHandler,
		JobHandlerRegistration registration
	) {
		var connectionString = await GetConnectionStringAsync();

		var services = new ServiceCollection();
		services.AddLogging(logging => logging.ClearProviders());
		services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connectionString));
		services.AddSingleton(collector);
		registerHandler(services);
		services.AddSingleton(registration);
		services.AddSingleton<JobHandlerRegistry>();
		services.AddSingleton<JobsMetrics>();

		return services.BuildServiceProvider(new ServiceProviderOptions {
			ValidateScopes = true,
			ValidateOnBuild = true
		});
	}

	private static JobQueueProcessor CreateProcessor(ServiceProvider provider) {
		return new JobQueueProcessor(
			provider.GetRequiredService<IServiceScopeFactory>(),
			provider.GetRequiredService<JobHandlerRegistry>(),
			provider.GetRequiredService<JobsMetrics>(),
			NullLogger<JobQueueProcessor>.Instance
		);
	}

	private static string UniqueType(string prefix) {
		return $"spec.{prefix}.{Guid.NewGuid():N}";
	}

	private static async Task<List<Guid>> SeedDueJobsAsync(
		AppDbContext dbContext,
		string jobType,
		int count
	) {
		var ids = new List<Guid>();

		for (var i = 0; i < count; i++) {
			var row = new JobQueueItem { JobType = jobType };
			await dbContext.JobQueue.AddAsync(row);
			await dbContext.SaveChangesAsync();
			ids.Add(row.Id.GetValueOrDefault());
		}

		return ids;
	}

	private async Task DeleteJobsByTypeAsync(string jobType) {
		await using var dbContext = await CreateDbContextAsync();
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_queue WHERE job_type = {jobType}"
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_dead_letter WHERE job_type = {jobType}"
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

	// Singleton probe shared with the scoped handlers: carries configuration and
	// collects per-invocation instance identities.
	private sealed class ScopeProbeCollector {
		public required string JobType { get; init; }
		public string MarkerType { get; init; } = string.Empty;
		public bool ThrowAfterMarkerWrite { get; init; }
		public List<object> HandlerInstances { get; } = [];
		public List<object> ContextInstances { get; } = [];
	}

	// A scoped handler injecting AppDbContext exactly like a domain handler will.
	private sealed class ScopedProbeHandler : IJobHandler {
		private readonly AppDbContext _dbContext;
		private readonly ScopeProbeCollector _collector;

		public ScopedProbeHandler(AppDbContext dbContext, ScopeProbeCollector collector) {
			_dbContext = dbContext;
			_collector = collector;
		}

		public string JobType {
			get { return _collector.JobType; }
		}

		public Task<JobOutcome> HandleAsync(
			JobContext context,
			CancellationToken cancellationToken
		) {
			_collector.HandlerInstances.Add(this);
			_collector.ContextInstances.Add(_dbContext);
			return Task.FromResult<JobOutcome>(JobOutcome.Succeeded);
		}
	}

	// Fails permanently, then writes a marker row through its INJECTED scoped
	// context inside the terminal hook — flushing it so the commit/rollback
	// assertions prove transaction sharing, not merely change-tracker sharing.
	private sealed class ScopedTerminalHandler : IJobHandler {
		private readonly AppDbContext _dbContext;
		private readonly ScopeProbeCollector _collector;

		public ScopedTerminalHandler(AppDbContext dbContext, ScopeProbeCollector collector) {
			_dbContext = dbContext;
			_collector = collector;
		}

		public string JobType {
			get { return _collector.JobType; }
		}

		public Task<JobOutcome> HandleAsync(
			JobContext context,
			CancellationToken cancellationToken
		) {
			return Task.FromResult<JobOutcome>(
				new JobOutcome.PermanentFailure("always terminal")
			);
		}

		public async Task OnTerminalFailureAsync(
			JobContext context,
			CancellationToken cancellationToken
		) {
			var marker = new JobDeadLetter {
				OriginalJobId = context.JobId,
				JobType = _collector.MarkerType,
				Payload = "{}"
			};
			await _dbContext.JobDeadLetter.AddAsync(marker, cancellationToken);
			await _dbContext.SaveChangesAsync(cancellationToken);

			if (_collector.ThrowAfterMarkerWrite) {
				throw new InvalidOperationException(
					"ScopedTerminalHandler: simulated hook failure after flushed write"
				);
			}
		}
	}
}
