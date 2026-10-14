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
	private readonly ApiFixture _Fixture;

	public SystemJobDefinitionQueryServiceSpec(ApiFixture fixture) {
		this._Fixture = fixture;
	}

	[Fact]
	public async Task ItShouldListEnabledAndDisabledDefinitions() {
		var enabledKey = SystemJobDefinitionQueryServiceSpec._NewJobKey("list-enabled");
		var disabledKey = SystemJobDefinitionQueryServiceSpec._NewJobKey("list-disabled");

		try {
			await this._SeedDefinitionAsync(enabledKey, isEnabled: true);
			await this._SeedDefinitionAsync(disabledKey, isEnabled: false);

			var service = await this._CreateServiceAsync();
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
			await this._CleanupAsync(enabledKey);
			await this._CleanupAsync(disabledKey);
		}
	}

	[Fact]
	public async Task ItShouldFilterByIsEnabled() {
		var enabledKey = SystemJobDefinitionQueryServiceSpec._NewJobKey("filter-enabled");
		var disabledKey = SystemJobDefinitionQueryServiceSpec._NewJobKey("filter-disabled");

		try {
			await this._SeedDefinitionAsync(enabledKey, isEnabled: true);
			await this._SeedDefinitionAsync(disabledKey, isEnabled: false);

			var service = await this._CreateServiceAsync();

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
			await this._CleanupAsync(enabledKey);
			await this._CleanupAsync(disabledKey);
		}
	}

	[Fact]
	public async Task ItShouldGetOneByIdWithRecentOccurrences() {
		var jobKey = SystemJobDefinitionQueryServiceSpec._NewJobKey("detail");
		var definitionId = await this._SeedDefinitionAsync(jobKey, isEnabled: true);

		try {
			await using var dbContext = await this._CreateDbContextAsync();
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

			var service = await this._CreateServiceAsync();
			var detail = await service.GetByIdAsync(definitionId);

			detail.Should().NotBeNull();
			var detailValue = detail.Required();
			detailValue.Id.Should().Be(definitionId);
			detailValue.JobKey.Should().Be(jobKey);
			detailValue.RecentOccurrences.Should().HaveCount(2);
			detailValue.RecentOccurrences.First().ScheduledFireAt.Should()
				.BeOnOrAfter(detailValue.RecentOccurrences.Last().ScheduledFireAt);
		} finally {
			await this._CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForUnknownId() {
		var service = await this._CreateServiceAsync();

		var detail = await service.GetByIdAsync(Guid.NewGuid());

		detail.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldEnableADisabledDefinition() {
		var jobKey = SystemJobDefinitionQueryServiceSpec._NewJobKey("enable");
		var definitionId = await this._SeedDefinitionAsync(jobKey, isEnabled: false);

		try {
			var service = await this._CreateServiceAsync();
			var result = await service.UpdateEnabledAsync(
				new UpdateSystemJobEnabledArgs(definitionId, IsEnabled: true)
			);

			result.Should().BeOfType<UpdateSystemJobEnabledResult.Success>()
				.Which.IsEnabled.Should().BeTrue();

			await using var verify = await this._CreateDbContextAsync();
			(await verify.SystemJobDefinition.SingleAsync(
				row => row.JobKey == jobKey
			)).IsEnabled.Should().BeTrue();
		} finally {
			await this._CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldRefuseToDisableAProtectedKey() {
		var protectedJobKey =
			PublyApp.Api.Modules.Messaging.Jobs.EmailPreparedSendsRetentionHandler
				.JobKey;

		// The seeder plants this exact row (unique ux_system_job_definitions_job_key),
		// so the spec reuses it instead of inserting a duplicate.
		var definitionId = await this._GetExistingOrSeedAsync(
			protectedJobKey, isEnabled: true
		);

		try {
			var service = await this._CreateServiceAsync();
			var result = await service.UpdateEnabledAsync(
				new UpdateSystemJobEnabledArgs(definitionId, IsEnabled: false)
			);

			result.Should()
				.BeOfType<UpdateSystemJobEnabledResult.ProtectedKey>();

			await using var verify = await this._CreateDbContextAsync();
			(await verify.SystemJobDefinition.SingleAsync(
				row => row.JobKey == protectedJobKey
			)).IsEnabled.Should().BeTrue("K-3: the disable must not land");
		} finally {
			// No cleanup: this is the seeder-owned row, other specs may rely on it.
		}
	}

	[Fact]
	public async Task ItShouldDisableAnUnprotectedKey() {
		var jobKey = SystemJobDefinitionQueryServiceSpec._NewJobKey("disable");
		var definitionId = await this._SeedDefinitionAsync(jobKey, isEnabled: true);

		try {
			var service = await this._CreateServiceAsync();
			var result = await service.UpdateEnabledAsync(
				new UpdateSystemJobEnabledArgs(definitionId, IsEnabled: false)
			);

			result.Should().BeOfType<UpdateSystemJobEnabledResult.Success>()
				.Which.IsEnabled.Should().BeFalse();

			await using var verify = await this._CreateDbContextAsync();
			(await verify.SystemJobDefinition.SingleAsync(
				row => row.JobKey == jobKey
			)).IsEnabled.Should().BeFalse();
		} finally {
			await this._CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldUpdateCronWritingTheNewCronWithoutRotatingTheScheduleEpoch() {
		var jobKey = SystemJobDefinitionQueryServiceSpec._NewJobKey("cron");
		var epoch = Guid.NewGuid();
		var definitionId = await this._SeedDefinitionAsync(
			jobKey, isEnabled: true, scheduleEpoch: epoch
		);

		try {
			var service = await this._CreateServiceAsync();
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

			await using var verify = await this._CreateDbContextAsync();
			var definition = await verify.SystemJobDefinition
				.SingleAsync(row => row.JobKey == jobKey);
			definition.CronExpression.Should().Be("0 0/7 * * * ?");
			definition.ScheduleEpoch.Should().Be(epoch);
		} finally {
			await this._CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldRefuseAnInvalidCronExpression() {
		var jobKey = SystemJobDefinitionQueryServiceSpec._NewJobKey("bad-cron");
		var epoch = Guid.NewGuid();
		var definitionId = await this._SeedDefinitionAsync(
			jobKey, isEnabled: true, scheduleEpoch: epoch
		);

		try {
			var service = await this._CreateServiceAsync();
			var result = await service.UpdateCronAsync(
				new UpdateSystemJobCronArgs(
					definitionId,
					NewCronExpression: "not-a-cron"
				)
			);

			result.Should().BeOfType<UpdateSystemJobCronResult.InvalidCron>();

			await using var verify = await this._CreateDbContextAsync();
			var definition = await verify.SystemJobDefinition
				.SingleAsync(row => row.JobKey == jobKey);
			definition.CronExpression.Should().NotBe("not-a-cron");
			definition.ScheduleEpoch.Should().Be(epoch);
		} finally {
			await this._CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldTriggerNowEnqueuingOneQueueRow() {
		var jobKey = SystemJobDefinitionQueryServiceSpec._NewJobKey("trigger");
		var epoch = Guid.NewGuid();
		var definitionId = await this._SeedDefinitionAsync(
			jobKey, isEnabled: true, scheduleEpoch: epoch
		);

		try {
			var service = await this._CreateServiceAsync();
			var result = await service.TriggerNowAsync(
				new TriggerSystemJobArgs(definitionId)
			);

			var enqueued = result.Should()
				.BeOfType<TriggerSystemJobResult.Enqueued>().Subject;
			enqueued.ScheduleEpoch.Should().Be(epoch);

			await using var verify = await this._CreateDbContextAsync();
			(await verify.JobQueue.CountAsync(row => row.JobType == jobKey))
				.Should().Be(1);
			(await verify.SystemJobOccurrence.CountAsync(
				row => row.JobKey == jobKey
			)).Should().Be(1);
		} finally {
			await this._CleanupAsync(jobKey);
		}
	}

	private async Task<SystemJobDefinitionQueryService> _CreateServiceAsync() {
		var dbContext = await this._CreateDbContextAsync();
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

	private async Task<Guid> _SeedDefinitionAsync(
		string jobKey,
		bool isEnabled,
		Guid? scheduleEpoch = null
	) {
		await using var dbContext = await this._CreateDbContextAsync();
		var definition = new SystemJobDefinition {
			JobKey = jobKey,
			CronExpression = "0 0/5 * * * ?",
			ScheduleEpoch = scheduleEpoch ?? Guid.NewGuid(),
			IsEnabled = isEnabled,
		};
		await dbContext.SystemJobDefinition.AddAsync(definition);
		await dbContext.SaveChangesAsync();
		var id = definition.Id;
		if (id is null) {
			throw new InvalidOperationException(
				"Seeded system job definition returned no id."
			);
		}

		return id.Value;
	}

	/// <summary>
	/// For seeder-owned keys: returns the existing row's id when the fixture
	/// database already carries it (unique job_key constraint), else seeds it.
	/// </summary>
	private async Task<Guid> _GetExistingOrSeedAsync(string jobKey, bool isEnabled) {
		await using var dbContext = await this._CreateDbContextAsync();
		var existingId = await (
			from definition in dbContext.SystemJobDefinition.AsNoTracking()
			where definition.JobKey == jobKey && !definition.IsDeleted
			select definition.Id
		).FirstOrDefaultAsync();

		if (existingId.HasValue) {
			return existingId.Value;
		}

		return await this._SeedDefinitionAsync(jobKey, isEnabled);
	}

	private async Task _CleanupAsync(string jobKey) {
		await using var dbContext = await this._CreateDbContextAsync();
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

	private static string _NewJobKey(string suffix) {
		return $"spec.sysdef.{suffix}.{Guid.NewGuid():N}";
	}

	private async Task<AppDbContext> _CreateDbContextAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
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
