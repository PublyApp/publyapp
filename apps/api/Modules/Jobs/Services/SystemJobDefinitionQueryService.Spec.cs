using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Infrastructure.Jobs.Quartz;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Jobs.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Jobs.Services;

// Direct-service specs over the fixture database (#636 staff jobs dashboard).
// The no-double-rotation contract is pinned here: UpdateCronAsync NEVER writes
// schedule_epoch — SyncSystemJobsJob is its only legitimate writer.
public sealed class SystemJobDefinitionQueryServiceSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public SystemJobDefinitionQueryServiceSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldListEnabledAndDisabledDefinitions() {
		var enabledKey = NewJobKey("list-enabled");
		var disabledKey = NewJobKey("list-disabled");

		try {
			await SeedDefinitionAsync(enabledKey, isEnabled: true);
			await SeedDefinitionAsync(disabledKey, isEnabled: false);

			var service = await CreateServiceAsync();
			var result = await service.FindAsync(new FindSystemJobDefinitionsArgs(
				Cursor: Guid.Empty,
				Limit: 100,
				IsEnabled: null
			));

			var page = result.Should()
				.BeOfType<FindSystemJobDefinitionsResult.Success>().Subject.Data;
			page.Data.Select(row => row.JobKey).Should().Contain(
				[enabledKey, disabledKey]
			);
		} finally {
			await CleanupAsync(enabledKey);
			await CleanupAsync(disabledKey);
		}
	}

	[Fact]
	public async Task ItShouldFilterByIsEnabled() {
		var enabledKey = NewJobKey("filter-enabled");
		var disabledKey = NewJobKey("filter-disabled");

		try {
			await SeedDefinitionAsync(enabledKey, isEnabled: true);
			await SeedDefinitionAsync(disabledKey, isEnabled: false);

			var service = await CreateServiceAsync();

			var enabledOnly = await service.FindAsync(new FindSystemJobDefinitionsArgs(
				Cursor: Guid.Empty,
				Limit: 100,
				IsEnabled: true
			));
			enabledOnly.Should().BeOfType<FindSystemJobDefinitionsResult.Success>()
				.Subject.Data.Data.Select(row => row.JobKey)
				.Should().Contain(enabledKey)
				.And.NotContain(disabledKey);

			var disabledOnly = await service.FindAsync(new FindSystemJobDefinitionsArgs(
				Cursor: Guid.Empty,
				Limit: 100,
				IsEnabled: false
			));
			disabledOnly.Should().BeOfType<FindSystemJobDefinitionsResult.Success>()
				.Subject.Data.Data.Select(row => row.JobKey)
				.Should().Contain(disabledKey)
				.And.NotContain(enabledKey);
		} finally {
			await CleanupAsync(enabledKey);
			await CleanupAsync(disabledKey);
		}
	}

	[Fact]
	public async Task ItShouldGetOneByIdWithRecentOccurrences() {
		var jobKey = NewJobKey("detail");
		var definitionId = await SeedDefinitionAsync(jobKey, isEnabled: true);

		try {
			await using var dbContext = await CreateDbContextAsync();
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				INSERT INTO system_job_occurrences (job_key, scheduled_fire_at)
				VALUES ({jobKey}, now() - make_interval(mins => 30))
				"""
			);
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				INSERT INTO system_job_occurrences (job_key, scheduled_fire_at)
				VALUES ({jobKey}, now() - make_interval(mins => 10))
				"""
			);

			var service = await CreateServiceAsync();
			var detail = await service.GetByIdAsync(definitionId);

			detail.Should().NotBeNull();
			detail!.Id.Should().Be(definitionId);
			detail.JobKey.Should().Be(jobKey);
			detail.RecentOccurrences.Should().HaveCount(2);
			detail.RecentOccurrences.First().ScheduledFireAt.Should()
				.BeOnOrAfter(detail.RecentOccurrences.Last().ScheduledFireAt);
		} finally {
			await CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForUnknownId() {
		var service = await CreateServiceAsync();

		var detail = await service.GetByIdAsync(Guid.NewGuid());

		detail.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldEnableADisabledDefinition() {
		var jobKey = NewJobKey("enable");
		var definitionId = await SeedDefinitionAsync(jobKey, isEnabled: false);

		try {
			var service = await CreateServiceAsync();
			var result = await service.UpdateEnabledAsync(
				new UpdateSystemJobEnabledArgs(definitionId, IsEnabled: true)
			);

			result.Should().BeOfType<UpdateSystemJobEnabledResult.Success>()
				.Which.IsEnabled.Should().BeTrue();

			await using var verify = await CreateDbContextAsync();
			(await verify.SystemJobDefinition.SingleAsync(
				row => row.JobKey == jobKey
			)).IsEnabled.Should().BeTrue();
		} finally {
			await CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldRefuseToDisableAProtectedKey() {
		var protectedJobKey =
			PublyApp.Api.Modules.Messaging.Jobs.EmailPreparedSendsRetentionHandler
				.JobKey;

		// The seeder plants this exact row (unique ux_system_job_definitions_job_key),
		// so the spec reuses it instead of inserting a duplicate.
		var definitionId = await GetExistingOrSeedAsync(
			protectedJobKey, isEnabled: true
		);

		try {
			var service = await CreateServiceAsync();
			var result = await service.UpdateEnabledAsync(
				new UpdateSystemJobEnabledArgs(definitionId, IsEnabled: false)
			);

			result.Should()
				.BeOfType<UpdateSystemJobEnabledResult.ProtectedKey>();

			await using var verify = await CreateDbContextAsync();
			(await verify.SystemJobDefinition.SingleAsync(
				row => row.JobKey == protectedJobKey
			)).IsEnabled.Should().BeTrue("K-3: the disable must not land");
		} finally {
			// No cleanup: this is the seeder-owned row, other specs may rely on it.
		}
	}

	[Fact]
	public async Task ItShouldDisableAnUnprotectedKey() {
		var jobKey = NewJobKey("disable");
		var definitionId = await SeedDefinitionAsync(jobKey, isEnabled: true);

		try {
			var service = await CreateServiceAsync();
			var result = await service.UpdateEnabledAsync(
				new UpdateSystemJobEnabledArgs(definitionId, IsEnabled: false)
			);

			result.Should().BeOfType<UpdateSystemJobEnabledResult.Success>()
				.Which.IsEnabled.Should().BeFalse();

			await using var verify = await CreateDbContextAsync();
			(await verify.SystemJobDefinition.SingleAsync(
				row => row.JobKey == jobKey
			)).IsEnabled.Should().BeFalse();
		} finally {
			await CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldUpdateCronWritingTheNewCronWithoutRotatingTheScheduleEpoch() {
		var jobKey = NewJobKey("cron");
		var epoch = Guid.NewGuid();
		var definitionId = await SeedDefinitionAsync(
			jobKey, isEnabled: true, scheduleEpoch: epoch
		);

		try {
			var service = await CreateServiceAsync();
			var result = await service.UpdateCronAsync(
				new UpdateSystemJobCronArgs(
					definitionId,
					NewCronExpression: "0 0/7 * * * ?"
				)
			);

			var updated = result.Should()
				.BeOfType<UpdateSystemJobCronResult.Success>().Subject;
			updated.ScheduleEpoch.Should().Be(epoch,
				"the staff service must NEVER rotate the epoch");

			await using var verify = await CreateDbContextAsync();
			var definition = await verify.SystemJobDefinition
				.SingleAsync(row => row.JobKey == jobKey);
			definition.CronExpression.Should().Be("0 0/7 * * * ?");
			definition.ScheduleEpoch.Should().Be(epoch);
		} finally {
			await CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldRefuseAnInvalidCronExpression() {
		var jobKey = NewJobKey("bad-cron");
		var epoch = Guid.NewGuid();
		var definitionId = await SeedDefinitionAsync(
			jobKey, isEnabled: true, scheduleEpoch: epoch
		);

		try {
			var service = await CreateServiceAsync();
			var result = await service.UpdateCronAsync(
				new UpdateSystemJobCronArgs(
					definitionId,
					NewCronExpression: "not-a-cron"
				)
			);

			result.Should().BeOfType<UpdateSystemJobCronResult.InvalidCron>();

			await using var verify = await CreateDbContextAsync();
			var definition = await verify.SystemJobDefinition
				.SingleAsync(row => row.JobKey == jobKey);
			definition.CronExpression.Should().NotBe("not-a-cron");
			definition.ScheduleEpoch.Should().Be(epoch);
		} finally {
			await CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldTriggerNowEnqueuingOneQueueRow() {
		var jobKey = NewJobKey("trigger");
		var epoch = Guid.NewGuid();
		var definitionId = await SeedDefinitionAsync(
			jobKey, isEnabled: true, scheduleEpoch: epoch
		);

		try {
			var service = await CreateServiceAsync();
			var result = await service.TriggerNowAsync(
				new TriggerSystemJobArgs(definitionId)
			);

			var enqueued = result.Should()
				.BeOfType<TriggerSystemJobResult.Enqueued>().Subject;
			enqueued.ScheduleEpoch.Should().Be(epoch);

			await using var verify = await CreateDbContextAsync();
			(await verify.JobQueue.CountAsync(row => row.JobType == jobKey))
				.Should().Be(1);
			(await verify.SystemJobOccurrence.CountAsync(
				row => row.JobKey == jobKey
			)).Should().Be(1);
		} finally {
			await CleanupAsync(jobKey);
		}
	}

	private async Task<SystemJobDefinitionQueryService> CreateServiceAsync() {
		var dbContext = await CreateDbContextAsync();
		return new SystemJobDefinitionQueryService(
			dbContext,
			new EnqueueSystemJobBoundary(
				dbContext,
				new EnqueueSystemJobJob(
					dbContext,
					NullLogger<EnqueueSystemJobJob>.Instance
				)
			)
		);
	}

	private async Task<Guid> SeedDefinitionAsync(
		string jobKey,
		bool isEnabled,
		Guid? scheduleEpoch = null
	) {
		await using var dbContext = await CreateDbContextAsync();
		var definition = new SystemJobDefinition {
			JobKey = jobKey,
			CronExpression = "0 0/5 * * * ?",
			ScheduleEpoch = scheduleEpoch ?? Guid.NewGuid(),
			IsEnabled = isEnabled,
		};
		await dbContext.SystemJobDefinition.AddAsync(definition);
		await dbContext.SaveChangesAsync();
		return definition.Id ?? throw new InvalidOperationException(
			"Seeded system job definition returned no id."
		);
	}

	/// <summary>
	/// For seeder-owned keys: returns the existing row's id when the fixture
	/// database already carries it (unique job_key constraint), else seeds it.
	/// </summary>
	private async Task<Guid> GetExistingOrSeedAsync(string jobKey, bool isEnabled) {
		await using var dbContext = await CreateDbContextAsync();
		var existingId = await (
			from definition in dbContext.SystemJobDefinition.AsNoTracking()
			where definition.JobKey == jobKey && !definition.IsDeleted
			select definition.Id
		).FirstOrDefaultAsync();

		if (existingId.HasValue) {
			return existingId.Value;
		}

		return await SeedDefinitionAsync(jobKey, isEnabled);
	}

	private async Task CleanupAsync(string jobKey) {
		await using var dbContext = await CreateDbContextAsync();
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM system_job_occurrences WHERE job_key = {jobKey}"
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_queue WHERE job_type = {jobKey}"
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM system_job_definitions WHERE job_key = {jobKey}"
		);
	}

	private static string NewJobKey(string suffix) {
		return $"spec.sysdef.{suffix}.{Guid.NewGuid():N}";
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
