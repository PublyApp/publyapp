using System.Collections.Specialized;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Auth.Jobs;
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Jobs.Seeders;
using PublyApp.Api.Modules.Messaging.Jobs;

using Quartz;
using Quartz.Impl;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs.Quartz;

// Drives SyncSystemJobsJob.ReconcileAsync directly against a real (never-started) RAM
// scheduler (public-methods-for-determinism). The load-bearing regressions: a
// definition whose cron was valid and becomes invalid must have its OLD trigger
// removed (not left firing the stale schedule forever), and one invalid row must
// never stop the remaining definitions from reconciling.
public sealed class SyncSystemJobsJobSpec : IClassFixture<ApiFixture> {
	private const string ValidCron = "0 0/5 * * * ?";
	private const string InvalidCron = "definitely-not-a-cron";

	// The template-seeded cadence of email-prepared-sends-retention (design §7.3):
	// every 10 minutes, materially under EMAIL_PREPARED_SWEEP_MAX_LAG_MINUTES.
	// Read from SystemJobDefinitionSeeder.GetCodeDefinedDefaults() — the single source
	// of truth the restore reverts to — instead of a hand-copied literal that could
	// drift silently while every spec here stays green.
	private static readonly string PreparedSweepCodeCron =
		SystemJobDefinitionSeeder.GetCodeDefinedDefaults()
			.Single(definition => definition.JobKey == EmailPreparedSendsRetentionHandler.JobKey)
			.CronExpression;

	private readonly ApiFixture _fixture;

	public SyncSystemJobsJobSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldRemoveTheScheduledTriggerWhenAValidCronBecomesInvalid() {
		await using var dbContext = await CreateDbContextAsync();
		await dbContext.Database.ExecuteSqlRawAsync("DELETE FROM system_job_definitions;");
		var scheduler = await CreateRamSchedulerAsync();

		var definition = new SystemJobDefinition {
			JobKey = "flips-to-invalid",
			CronExpression = ValidCron,
		};
		await dbContext.SystemJobDefinition.AddAsync(definition);
		await dbContext.SaveChangesAsync();

		var job = new SyncSystemJobsJob(dbContext, NullLogger<SyncSystemJobsJob>.Instance);
		var jobKey = new JobKey("flips-to-invalid", SyncSystemJobsJob.SystemJobsGroup);

		// While valid, the definition is scheduled.
		await job.ReconcileAsync(scheduler, CancellationToken.None);
		(await scheduler.CheckExists(jobKey)).Should().BeTrue("a valid cron schedules a trigger");

		// The dashboard edit makes the cron invalid: the NEXT reconcile must remove
		// the previously-scheduled trigger, not keep firing the old schedule.
		definition.CronExpression = InvalidCron;
		await dbContext.SaveChangesAsync();

		await job.ReconcileAsync(scheduler, CancellationToken.None);
		(await scheduler.CheckExists(jobKey)).Should().BeFalse(
			"a definition whose cron became invalid must lose its old trigger"
		);
	}

	[Fact]
	public async Task ItShouldStillReconcileValidDefinitionsWhenAnotherRowHasAnInvalidCron() {
		await using var dbContext = await CreateDbContextAsync();
		await dbContext.Database.ExecuteSqlRawAsync("DELETE FROM system_job_definitions;");
		var scheduler = await CreateRamSchedulerAsync();

		// Seed the invalid row FIRST so a fail-fast regression (returning on the bad
		// row instead of skipping it) would starve the valid one behind it.
		await dbContext.SystemJobDefinition.AddAsync(new SystemJobDefinition {
			JobKey = "broken-job",
			CronExpression = InvalidCron,
		});
		await dbContext.SystemJobDefinition.AddAsync(new SystemJobDefinition {
			JobKey = "healthy-job",
			CronExpression = ValidCron,
		});
		await dbContext.SaveChangesAsync();

		var job = new SyncSystemJobsJob(dbContext, NullLogger<SyncSystemJobsJob>.Instance);
		await job.ReconcileAsync(scheduler, CancellationToken.None);

		var brokenKey = new JobKey("broken-job", SyncSystemJobsJob.SystemJobsGroup);
		var healthyKey = new JobKey("healthy-job", SyncSystemJobsJob.SystemJobsGroup);

		(await scheduler.CheckExists(brokenKey)).Should().BeFalse(
			"an invalid cron must never be scheduled"
		);
		(await scheduler.CheckExists(healthyKey)).Should().BeTrue(
			"one bad row must not stop the rest of the sync"
		);
	}

	[Fact]
	public async Task ItShouldNotDoubleEnqueueWhenAReplacedTriggerRefiresTheSameScheduledInstant() {
		var jobKeyName = $"same-cron-{Guid.NewGuid():N}";
		var epoch = Guid.NewGuid();
		var scheduledFireAt = DateTime.UtcNow.AddMinutes(1);
		await using var dbContext = await CreateDbContextAsync();
		var scheduler = await CreateRamSchedulerAsync();

		try {
			await dbContext.SystemJobDefinition.AddAsync(new SystemJobDefinition {
				JobKey = jobKeyName,
				CronExpression = ValidCron,
				ScheduleEpoch = epoch,
			});
			await dbContext.SaveChangesAsync();

			var syncJob = new SyncSystemJobsJob(
				dbContext, NullLogger<SyncSystemJobsJob>.Instance
			);
			await syncJob.ReconcileAsync(scheduler, CancellationToken.None);
			var enqueueJob = new EnqueueSystemJobJob(
				dbContext, NullLogger<EnqueueSystemJobJob>.Instance
			);
			await enqueueJob.EnqueueOccurrenceAsync(
				jobKeyName, scheduledFireAt, epoch, CancellationToken.None
			);

			await syncJob.ReconcileAsync(scheduler, CancellationToken.None);
			var jobDetail = await scheduler.GetJobDetail(
				new JobKey(jobKeyName, SyncSystemJobsJob.SystemJobsGroup)
			);
			jobDetail.Should().NotBeNull();
			jobDetail?.JobDataMap.GetString(EnqueueSystemJobJob.ScheduleEpochDataKey)
				.Should().Be(epoch.ToString());
			await enqueueJob.EnqueueOccurrenceAsync(
				jobKeyName, scheduledFireAt, epoch, CancellationToken.None
			);

			(await dbContext.JobQueue.CountAsync(row => row.JobType == jobKeyName))
				.Should().Be(1);
		} finally {
			await CleanupJobAsync(dbContext, jobKeyName);
			await scheduler.Shutdown(waitForJobsToComplete: false);
		}
	}

	[Fact]
	public async Task ItShouldRotateScheduleEpochWhenTheCronChangesAndStampTheReplacement() {
		var jobKeyName = $"epoch-change-{Guid.NewGuid():N}";
		var originalEpoch = Guid.NewGuid();
		await using var dbContext = await CreateDbContextAsync();
		var scheduler = await CreateRamSchedulerAsync();

		try {
			var definition = new SystemJobDefinition {
				JobKey = jobKeyName,
				CronExpression = ValidCron,
				ScheduleEpoch = originalEpoch,
			};
			await dbContext.SystemJobDefinition.AddAsync(definition);
			await dbContext.SaveChangesAsync();

			var syncJob = new SyncSystemJobsJob(
				dbContext, NullLogger<SyncSystemJobsJob>.Instance
			);
			await syncJob.ReconcileAsync(scheduler, CancellationToken.None);
			definition.CronExpression = "0 0/10 * * * ?";
			await dbContext.SaveChangesAsync();
			await syncJob.ReconcileAsync(scheduler, CancellationToken.None);

			definition.ScheduleEpoch.Should().NotBe(originalEpoch);
			var jobDetail = await scheduler.GetJobDetail(
				new JobKey(jobKeyName, SyncSystemJobsJob.SystemJobsGroup)
			);
			jobDetail.Should().NotBeNull();
			jobDetail?.JobDataMap.GetString(EnqueueSystemJobJob.ScheduleEpochDataKey)
				.Should().Be(definition.ScheduleEpoch.ToString());
		} finally {
			await CleanupJobAsync(dbContext, jobKeyName);
			await scheduler.Shutdown(waitForJobsToComplete: false);
		}
	}

	// --- #865: the privacy-load-bearing sweep's schedule cannot be silently disabled ----

	// The K-3 bound, definition level: email-prepared-sends-retention deletes token-bearing
	// bytes and is the only sweep whose cadence IS the privacy control (§7.3). An operator
	// (or a bad dashboard write) flipping is_enabled=false must NOT remove its trigger:
	// the next reconcile must re-enable the row (transparent cause in a WARNING), keep it
	// scheduled, and leave every OTHER definition free to disable.
	[Fact]
	public async Task ItShouldRefuseToDisableThePrivacyLoadBearingPreparedSweepAndReEnableIt() {
		await using var dbContext = await CreateDbContextAsync();
		var scheduler = await CreateRamSchedulerAsync();

		try {
			var protectedKey = EmailPreparedSendsRetentionHandler.JobKey;
			var jobKey = new JobKey(protectedKey, SyncSystemJobsJob.SystemJobsGroup);

			// Earlier tests in this class wipe system_job_definitions wholesale; restore
			// (or create) the seeded row rather than assuming anything about test order.
			await EnsureDefinitionPresentAsync(dbContext, protectedKey, PreparedSweepCodeCron);
			var definition = await dbContext.SystemJobDefinition
				.AsNoTracking()
				.SingleAsync(d => d.JobKey == protectedKey && !d.IsDeleted);
			var originalCron = definition.CronExpression;

			var job = new SyncSystemJobsJob(dbContext, NullLogger<SyncSystemJobsJob>.Instance);
			await job.ReconcileAsync(scheduler, CancellationToken.None);
			(await scheduler.CheckExists(jobKey)).Should().BeTrue("the enabled sweep is scheduled");

			// The operator disables the privacy-load-bearing sweep...
			await dbContext.SystemJobDefinition
				.Where(d => d.JobKey == protectedKey)
				.ExecuteUpdateAsync(s => s.SetProperty(d => d.IsEnabled, false));

			// ...and the NEXT reconcile must refuse the silent drop: the row is re-enabled,
			// persisted, and its trigger stays live.
			await job.ReconcileAsync(scheduler, CancellationToken.None);

			(await scheduler.CheckExists(jobKey)).Should().BeTrue(
				"disabling the prepared-state retention sweep must not remove its trigger — "
				+ "the cadence is a privacy control (K-3), so residency stays bounded"
			);
			var after = await dbContext.SystemJobDefinition
				.AsNoTracking()
				.FirstAsync(d => d.JobKey == protectedKey && !d.IsDeleted);
			after.IsEnabled.Should().BeTrue(
				"the refused disable is reverted with its cause logged, not dropped silently"
			);
			after.CronExpression.Should().Be(originalCron, "only the enable flag is touched");
		} finally {
			// Restore the seeded state for other spec classes sharing this database.
			await dbContext.SystemJobDefinition
				.Where(d => d.JobKey == EmailPreparedSendsRetentionHandler.JobKey)
				.ExecuteUpdateAsync(s => s.SetProperty(d => d.IsEnabled, true));
			await scheduler.Shutdown(waitForJobsToComplete: false);
		}
	}

	// --- #1349: protection must restore the WHOLE code-defined definition ----------------

	// The hole this closes: the #865 guard reverted ONLY is_enabled, so a protected sweep
	// whose cron was corrupted (invalid or emptied) sailed past it — and the cron-validity
	// split below then DELETED its trigger. The privacy control silently stopped running
	// while "protection" reported everything fine. The next reconcile must restore the
	// whole code-defined definition (cron + enabled) and keep the trigger live. Parameter
	// over the two corruptions the issue names; the trigger assertion comes FIRST so the
	// RED run names the deleted trigger, the headline symptom.
	//
	// Every reconcile pass runs under a FRESH DbContext, mirroring production where the
	// worker's DI scope is per-fire: sharing one context across passes lets EF's identity
	// resolution replay the stale pre-edit entity into the next pass (the exact
	// silent-drop trap the restore guard itself documents) — masking the bug instead of
	// proving it.
	[Theory]
	[InlineData(InvalidCron)]
	[InlineData("")]
	public async Task ItShouldRestoreTheWholeDefinitionAndTriggerWhenAProtectedSweepCronIsCorrupted(
		string corruptedCron
	) {
		await using var dbContext = await CreateDbContextAsync();
		var scheduler = await CreateRamSchedulerAsync();

		try {
			var protectedKey = EmailPreparedSendsRetentionHandler.JobKey;
			var jobKey = new JobKey(protectedKey, SyncSystemJobsJob.SystemJobsGroup);

			// Earlier tests in this class wipe system_job_definitions wholesale; restore
			// (or create) the seeded row rather than assuming anything about test order.
			await EnsureDefinitionPresentAsync(dbContext, protectedKey, PreparedSweepCodeCron);

			// Pass 1 under its own context (per-pass discipline, below).
			await using (var seedScope = await CreateDbContextAsync()) {
				var seedingJob = new SyncSystemJobsJob(
					seedScope,
					NullLogger<SyncSystemJobsJob>.Instance
				);
				await seedingJob.ReconcileAsync(scheduler, CancellationToken.None);
			}
			(await scheduler.CheckExists(jobKey)).Should().BeTrue("the healthy sweep is scheduled");

			// The corruption under test lands on the PROTECTED key through the same raw
			// UPDATE a dashboard edit uses (bypasses the change tracker).
			await dbContext.SystemJobDefinition
				.Where(d => d.JobKey == protectedKey)
				.ExecuteUpdateAsync(s => s.SetProperty(d => d.CronExpression, corruptedCron));

			// The NEXT reconcile must refuse the corruption end to end — under its own
			// per-pass context, never one that already tracked the healthy row.
			await using (var jobScope = await CreateDbContextAsync()) {
				var reconcilingJob = new SyncSystemJobsJob(
					jobScope,
					NullLogger<SyncSystemJobsJob>.Instance
				);
				await reconcilingJob.ReconcileAsync(scheduler, CancellationToken.None);
			}

			(await scheduler.CheckExists(jobKey)).Should().BeTrue(
				"with the cron restored the trigger must stay live — RED today: the "
					+ "invalid-cron split deletes it"
			);
			var after = await dbContext.SystemJobDefinition
				.AsNoTracking()
				.FirstAsync(d => d.JobKey == protectedKey && !d.IsDeleted);
			after.CronExpression.Should().Be(
				PreparedSweepCodeCron,
				"protection must restore the WHOLE code-defined definition — a rejected cron "
					+ "cannot survive on a privacy-load-bearing schedule"
			);
			after.IsEnabled.Should().BeTrue("the restored definition is enabled");
			var triggers = await scheduler.GetTriggersOfJob(jobKey, CancellationToken.None);
			triggers.OfType<ICronTrigger>().Should().ContainSingle().Which
				.CronExpressionString.Should().Be(
					PreparedSweepCodeCron,
					"the surviving trigger fires the restored cadence, not the corrupted one"
				);
		} finally {
			// Restore the seeded state (cron included) for other spec classes sharing this
			// database — in the RED run the corrupted cron survives the reconcile.
			await dbContext.SystemJobDefinition
				.Where(d => d.JobKey == EmailPreparedSendsRetentionHandler.JobKey)
				.ExecuteUpdateAsync(s => s
					.SetProperty(d => d.IsEnabled, true)
					.SetProperty(d => d.CronExpression, PreparedSweepCodeCron));
			await scheduler.Shutdown(waitForJobsToComplete: false);
		}
	}

	// Transparency twin: the whole-definition restore carries a WARNING naming the job,
	// the rejected cron, and the cron written back — an operator whose retune vanished
	// (or whose corruption was reverted) must be able to see exactly what happened.
	// Own-context discipline as above: the reconcile must SEE the corrupted row.
	[Fact]
	public async Task ItShouldNameTheJobAndTheRejectedCronInTheWholeDefinitionRestorationNotice() {
		await using var dbContext = await CreateDbContextAsync();
		var scheduler = await CreateRamSchedulerAsync();
		var logger = new CapturingLogger();

		try {
			var protectedKey = EmailPreparedSendsRetentionHandler.JobKey;
			var jobKey = new JobKey(protectedKey, SyncSystemJobsJob.SystemJobsGroup);

			await EnsureDefinitionPresentAsync(dbContext, protectedKey, PreparedSweepCodeCron);

			// Pass 1 under its own context (per-pass discipline, as in the theory above);
			// the logger is cleared so only the refusal pass's notices are asserted.
			await using (var seedScope = await CreateDbContextAsync()) {
				var seedingJob = new SyncSystemJobsJob(seedScope, logger);
				await seedingJob.ReconcileAsync(scheduler, CancellationToken.None);
			}
			logger.Clear();

			await using var corruptScope = await CreateDbContextAsync();
			await corruptScope.SystemJobDefinition
				.Where(d => d.JobKey == protectedKey)
				.ExecuteUpdateAsync(s => s.SetProperty(d => d.CronExpression, InvalidCron));

			await using (var jobScope = await CreateDbContextAsync()) {
				var reconcilingJob = new SyncSystemJobsJob(jobScope, logger);
				await reconcilingJob.ReconcileAsync(scheduler, CancellationToken.None);
			}

			var notice = logger.Warnings.Should().ContainSingle(
				entry => entry.Message.Contains(protectedKey, StringComparison.Ordinal),
				"exactly one transparent notice per refused corruption"
			).Subject;
			notice.Message.Should().Contain(
				InvalidCron, "the notice names the rejected cron, not just the job"
			);
			notice.Message.Should().Contain(
				PreparedSweepCodeCron, "the notice names the restored cron as the next state"
			);
		} finally {
			await dbContext.SystemJobDefinition
				.Where(d => d.JobKey == EmailPreparedSendsRetentionHandler.JobKey)
				.ExecuteUpdateAsync(s => s
					.SetProperty(d => d.IsEnabled, true)
					.SetProperty(d => d.CronExpression, PreparedSweepCodeCron));
			await scheduler.Shutdown(waitForJobsToComplete: false);
		}
	}

	// --- #1349 round 1: guard the guards ----------------------------------------------

	// Defeats the "bug via the protection path" mutation: if the restore ever trusts a
	// code-defined cron Quartz cannot parse, it WRITES the corruption onto the
	// privacy-load-bearing row and the cron-validity split then deletes its trigger —
	// the original bug, reintroduced through the guard meant to prevent it. The restore
	// must therefore refuse the pass loudly (a programming error shipped in the binary,
	// not runtime data) and leave the drifted row untouched. Proven through the job's
	// defaults SEAM, because production data cannot reach this state: the protection
	// list and the seeder derive from the same handler constants.
	[Fact]
	public async Task ItShouldRefuseToWriteAnInvalidCodeDefinedDefaultCronOntoAProtectedSweep() {
		await using var dbContext = await CreateDbContextAsync();
		var scheduler = await CreateRamSchedulerAsync();
		var logger = new CapturingLogger();

		try {
			var protectedKey = EmailPreparedSendsRetentionHandler.JobKey;
			var jobKey = new JobKey(protectedKey, SyncSystemJobsJob.SystemJobsGroup);

			await EnsureDefinitionPresentAsync(dbContext, protectedKey, PreparedSweepCodeCron);

			// Pass 1 schedules the healthy trigger the mutation-world regression is proven
			// against.
			await using (var seedScope = await CreateDbContextAsync()) {
				var seedingJob = new SyncSystemJobsJob(
					seedScope, NullLogger<SyncSystemJobsJob>.Instance
				);
				await seedingJob.ReconcileAsync(scheduler, CancellationToken.None);
			}
			(await scheduler.CheckExists(jobKey)).Should().BeTrue("the healthy sweep is scheduled");

			// The dashboard empties the cron (raw UPDATE, bypassing the change tracker).
			const string driftedCron = "";
			await dbContext.SystemJobDefinition
				.Where(d => d.JobKey == protectedKey)
				.ExecuteUpdateAsync(s => s.SetProperty(d => d.CronExpression, driftedCron));

			// The seam ships a CORRUPTED code-defined default: the exact state a developer
			// typo in the seeder would produce.
			var corruptedDefaults = SystemJobDefinitionSeeder.GetCodeDefinedDefaults()
				.Select(definition => definition.JobKey == protectedKey
					? new SystemJobDefinition {
						JobKey = definition.JobKey,
						CronExpression = InvalidCron,
						Description = definition.Description,
					}
					: definition)
				.ToList();

			await using var jobScope = await CreateDbContextAsync();
			var reconcilingJob = new SyncSystemJobsJob(jobScope, logger, () => corruptedDefaults);

			var reconcile = async () => await reconcilingJob.ReconcileAsync(
				scheduler, CancellationToken.None
			);
			var refusal = await reconcile.Should().ThrowAsync<InvalidOperationException>(
				"persisting an unparsable code-defined cron BY PROTECTION ITSELF is the "
					+ "original bug via the restore path — a programming error must be "
					+ "refused loudly, never written"
				);
			refusal.Which.Message.Should().Contain(
				protectedKey, "the refusal names the protected job"
			);
			refusal.Which.Message.Should().Contain(
				InvalidCron, "the refusal names the offending cron string"
			);

			// Nothing downstream ran: the drifted row keeps the operator-visible corruption
			// (honest state) and the healthy trigger from pass 1 is never deleted.
			var after = await dbContext.SystemJobDefinition
				.AsNoTracking()
				.FirstAsync(d => d.JobKey == protectedKey && !d.IsDeleted);
			after.CronExpression.Should().Be(
				driftedCron,
				"the refusal happens BEFORE any write — protection must not persist corruption"
			);
			(await scheduler.CheckExists(jobKey)).Should().BeTrue(
				"the aborted pass never reaches the cron-validity split, so the trigger "
					+ "survives"
			);
		} finally {
			await dbContext.SystemJobDefinition
				.Where(d => d.JobKey == EmailPreparedSendsRetentionHandler.JobKey)
				.ExecuteUpdateAsync(s => s
					.SetProperty(d => d.IsEnabled, true)
					.SetProperty(d => d.CronExpression, PreparedSweepCodeCron));
			await scheduler.Shutdown(waitForJobsToComplete: false);
		}
	}

	// Defeats the silent-false-negative mutation: a protected row whose drift has NO
	// code-defined default to restore from (protection list and seeder diverged) must
	// surface per row (Error naming the job and the cause) AND in the sweep-level
	// report — never a bare continue that scrolls away. Seam-proven like the refusal
	// above, for the same unreachability reason.
	[Fact]
	public async Task ItShouldLogAndReportADriftedProtectedSweepThatHasNoCodeDefinedDefault() {
		await using var dbContext = await CreateDbContextAsync();
		var scheduler = await CreateRamSchedulerAsync();
		var logger = new CapturingLogger();

		try {
			var protectedKey = EmailPreparedSendsRetentionHandler.JobKey;
			var jobKey = new JobKey(protectedKey, SyncSystemJobsJob.SystemJobsGroup);

			await EnsureDefinitionPresentAsync(dbContext, protectedKey, PreparedSweepCodeCron);

			// The drift under test: the operator disables the privacy-load-bearing sweep.
			await dbContext.SystemJobDefinition
				.Where(d => d.JobKey == protectedKey)
				.ExecuteUpdateAsync(s => s.SetProperty(d => d.IsEnabled, false));

			// The seam ships NO default for the protected key — the diverged-binary state.
			var orphaningDefaults = SystemJobDefinitionSeeder.GetCodeDefinedDefaults()
				.Where(definition => definition.JobKey != protectedKey)
				.ToList();

			await using var jobScope = await CreateDbContextAsync();
			var reconcilingJob = new SyncSystemJobsJob(jobScope, logger, () => orphaningDefaults);
			await reconcilingJob.ReconcileAsync(scheduler, CancellationToken.None);

			logger.Errors.Should().ContainSingle(
				entry => entry.Message.Contains(protectedKey, StringComparison.Ordinal),
				"exactly one per-row jobs.alert names the drifted row nothing could restore"
					+ " — and it is an ERROR, not a warning"
			);
			logger.Errors.Should().Contain(
				entry => entry.Message.Contains("unrepaired", StringComparison.Ordinal)
					&& entry.Message.Contains("out of 1", StringComparison.Ordinal),
				"the sweep itself reports the unrepaired count — a silent false negative "
					+ "must stay queryable after the per-row alerts scroll away"
			);
			(await scheduler.CheckExists(jobKey)).Should().BeFalse(
				"without a default there is nothing to restore from, so the disabled row "
					+ "is honestly unscheduled — which is exactly why the alerts above exist"
			);
		} finally {
			await dbContext.SystemJobDefinition
				.Where(d => d.JobKey == EmailPreparedSendsRetentionHandler.JobKey)
				.ExecuteUpdateAsync(s => s
					.SetProperty(d => d.IsEnabled, true)
					.SetProperty(d => d.CronExpression, PreparedSweepCodeCron));
			await scheduler.Shutdown(waitForJobsToComplete: false);
		}
	}

	// Non-vacuity twin: the guard must be keyed to the privacy-load-bearing sweep ONLY.
	// A housekeeping sweep (session cleanup carries no sensitive bytes) must remain freely
	// operator-disableable — a guard that blocks everything would break legitimate ops.
	[Fact]
	public async Task ItShouldStillHonorDisablingAHousekeepingSweep() {
		await using var dbContext = await CreateDbContextAsync();
		var scheduler = await CreateRamSchedulerAsync();

		try {
			var unprotectedKey = CleanupExpiredSessionsHandler.JobKey;
			var jobKey = new JobKey(unprotectedKey, SyncSystemJobsJob.SystemJobsGroup);

			// Same order-independence discipline as the protected-sweep spec above.
			await EnsureDefinitionPresentAsync(dbContext, unprotectedKey, ValidCron);
			var job = new SyncSystemJobsJob(dbContext, NullLogger<SyncSystemJobsJob>.Instance);
			await job.ReconcileAsync(scheduler, CancellationToken.None);
			(await scheduler.CheckExists(jobKey)).Should().BeTrue(
				"the enabled housekeeping sweep is scheduled"
			);

			await dbContext.SystemJobDefinition
				.Where(d => d.JobKey == unprotectedKey)
				.ExecuteUpdateAsync(s => s.SetProperty(d => d.IsEnabled, false));
			await job.ReconcileAsync(scheduler, CancellationToken.None);

			(await scheduler.CheckExists(jobKey)).Should().BeFalse(
				"a non-privacy sweep stays operator-disableable — the guard is scoped to the "
				+ "prepared-state retention schedule only"
			);
		} finally {
			await dbContext.SystemJobDefinition
				.Where(d => d.JobKey == CleanupExpiredSessionsHandler.JobKey)
				.ExecuteUpdateAsync(s => s.SetProperty(d => d.IsEnabled, true));
			await scheduler.Shutdown(waitForJobsToComplete: false);
		}
	}

	// Earlier tests in THIS class wipe system_job_definitions wholesale and every test
	// class shares one cloned database, so the template's seeded rows cannot be assumed
	// here. Restore (or create) the exact row a test needs instead of ordering tests.
	private static async Task EnsureDefinitionPresentAsync(
		AppDbContext dbContext,
		string jobKey,
		string cron
	) {
		var definition = await dbContext.SystemJobDefinition
			.IgnoreQueryFilters()
			.FirstOrDefaultAsync(d => d.JobKey == jobKey);
		if (definition is null) {
			await dbContext.SystemJobDefinition.AddAsync(new SystemJobDefinition {
				JobKey = jobKey,
				CronExpression = cron,
			});
		} else {
			definition.IsDeleted = false;
			definition.IsEnabled = true;
			definition.CronExpression = cron;
		}

		await dbContext.SaveChangesAsync();
	}

	// A real RAM-store scheduler; never started, since ScheduleJob/CheckExists/
	// GetJobKeys all work on a non-started scheduler and no trigger should fire here.
	private static async Task<IScheduler> CreateRamSchedulerAsync() {
		var properties = new NameValueCollection {
			["quartz.scheduler.instanceName"] = $"sync-spec-{Guid.NewGuid():N}",
			["quartz.scheduler.instanceId"] = "AUTO",
			["quartz.jobStore.type"] = "Quartz.Simpl.RAMJobStore, Quartz",
			["quartz.threadPool.type"] = "Quartz.Simpl.DefaultThreadPool, Quartz",
			["quartz.threadPool.maxConcurrency"] = "1",
		};

		return await new StdSchedulerFactory(properties).GetScheduler();
	}

	private async Task<AppDbContext> CreateDbContextAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was unexpectedly null.");
		}

		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
	}

	private static async Task CleanupJobAsync(AppDbContext dbContext, string jobKey) {
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

	// Minimal ILogger capture double: records warning-level rendered messages so specs
	// assert the transparent per-attempt notices (no repo capturing-logger helper exists).
	private sealed class CapturingLogger : ILogger<SyncSystemJobsJob> {
		public sealed record Entry(LogLevel Level, string Message);

		private readonly List<Entry> _entries = [];

		public IEnumerable<Entry> Warnings {
			get { return _entries.Where(e => e.Level == LogLevel.Warning); }
		}

		public IEnumerable<Entry> Errors {
			get { return _entries.Where(e => e.Level == LogLevel.Error); }
		}

		public void Clear() {
			_entries.Clear();
		}

		public IDisposable BeginScope<TState>(TState state) where TState : notnull {
			return NullScope.Instance;
		}

		public bool IsEnabled(LogLevel logLevel) {
			return true;
		}

		public void Log<TState>(
			LogLevel logLevel,
			EventId eventId,
			TState state,
			Exception? exception,
			Func<TState, Exception?, string> formatter
		) {
			_entries.Add(new Entry(logLevel, formatter(state, exception)));
		}

		private sealed class NullScope : IDisposable {
			public static readonly NullScope Instance = new();

			public void Dispose() {
			}
		}
	}
}
