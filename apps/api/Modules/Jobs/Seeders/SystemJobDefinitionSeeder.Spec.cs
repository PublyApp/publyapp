using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using Npgsql;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Auth.Jobs;
using PublyApp.Api.Modules.Jobs.Jobs;
using PublyApp.Api.Modules.Messaging.Jobs;

using Quartz;

using Xunit;

namespace PublyApp.Api.Modules.Jobs.Seeders;

// The seeder runs at test-host startup, so the rows already exist; these specs assert the
// seeded contract (all keys present, each key == its handler's JobType so the cron →
// EnqueueSystemJobJob → processor path resolves, crons are valid Quartz) and idempotency.
public sealed class SystemJobDefinitionSeederSpec : IClassFixture<ApiFixture> {
	private const string PreJobsMigrationId =
		"20260714135430_AddUserAccountMembershipUniqueness";

	// The design's default for EMAIL_PREPARED_SWEEP_MAX_LAG_MINUTES (§3.1). Mirrored as a
	// literal because the var itself ships with the prepared-state gauges, which are
	// blocked on the job_dead_letter.external_state_* columns; point this at
	// AppEnvironment once that lands, and the assertion below stops being an approximation
	// of the threshold and starts being the threshold.
	private const int MaxSweepLagMinutes = 60;

	// "Materially shorter" made concrete: at most a quarter of the overdue threshold, so a
	// single failed pass cannot put the fleet straight into breach and an alert means the
	// sweep is genuinely broken rather than merely jittery.
	private static readonly TimeSpan MaxPreparedSweepCadence =
		TimeSpan.FromMinutes(MaxSweepLagMinutes / 4.0);

	private readonly ApiFixture _fixture;

	private static readonly string[] ExpectedKeys = [
		CleanupExpiredSessionsHandler.JobKey,
		EmailLogRetentionHandler.JobKey,
		DeadLetterRetentionHandler.JobKey,
		SystemJobOccurrenceRetentionHandler.JobKey,
		EmailPreparedSendsRetentionHandler.JobKey,
		PublyApp.Api.Modules.Uploads.Jobs.UploadOrphanReclaimerHandler.JobKey,
		PublyApp.Api.Modules.Publishing.Jobs.DispatchDuePostsJob.JobKey,
	];

	public SystemJobDefinitionSeederSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	// Issue #1912: the seeded rows must be ENABLED — this asserts the REAL artifact
	// (the rows the seed pipeline actually wrote to the database), not an in-memory
	// model. The per-row `IsEnabled = true` assignments were removed from the seeder
	// because they were redundant with the entity default; deleting them left every
	// seeder test green, which is the invisibility the review classified. The entity
	// default is now the single place that decides, so a flip of that default must
	// redden HERE, where the base receives it — measured: flipping the default to
	// false fails this exact assertion on the seeded rows. The same witness exists
	// for the code-defined restore defaults
	// (ItShouldPinTheCodeDefinedDefaultsShapeThatProtectionRestoresFrom) and the
	// re-inserted row
	// (ItShouldReinsertAMissingKeyWithDefaultsWhileLeavingOperatorEditsUntouched).
	[Fact]
	public async Task ItShouldSeedEverySystemJobDefinitionWithAValidCron() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var rows = await dbContext.SystemJobDefinition
			.Where(d => ExpectedKeys.Contains(d.JobKey) && !d.IsDeleted)
			.ToListAsync();

		rows.Select(r => r.JobKey).Should().BeEquivalentTo(ExpectedKeys);
		rows.Should().OnlyContain(
			r => r.IsEnabled,
			"seeded system jobs are enabled — the entity default (the seeder's single "
				+ "source of truth for IsEnabled since #1912) must reach the rows the "
				+ "seed pipeline writes. The mutation that flips the default to false "
				+ "reddens here on the real DB rows."
		);
		rows.Should().OnlyContain(
			r => CronExpression.IsValidExpression(r.CronExpression),
			"every seeded cron must be a valid Quartz expression SyncSystemJobsJob can register"
		);
	}

	// #1349 round 1: GetCodeDefinedDefaults() is the source of truth the protection
	// restore reverts FROM (SyncSystemJobsJob), so any change to its SHAPE must be a
	// visible decision rather than silent drift through an untested accessor. The
	// per-key values themselves are asserted against the accessor in the job spec.
	[Fact]
	public void ItShouldPinTheCodeDefinedDefaultsShapeThatProtectionRestoresFrom() {
		var defaults = SystemJobDefinitionSeeder.GetCodeDefinedDefaults();

		defaults.Select(definition => definition.JobKey).Should().BeEquivalentTo(
			ExpectedKeys,
			"the restore source must cover exactly the code-defined system jobs"
		);
		defaults.Should().OnlyContain(
			definition => CronExpression.IsValidExpression(definition.CronExpression),
			"a default Quartz cannot parse trips the restore's programming-error gate "
				+ "and refuses the whole pass"
		);
		defaults.Should().OnlyContain(
			definition => definition.IsEnabled,
			"protection restores enabled=true — a disabled code default would fight "
				+ "the K-3 guard it feeds"
		);
		defaults.Single(
			definition => definition.JobKey == EmailPreparedSendsRetentionHandler.JobKey
		).CronExpression.Should().Be(
			"0 0/10 * * * ?",
			"the privacy-load-bearing cadence stays pinned at every 10 minutes (§7.3/K-3)"
		);
	}

	// K-3. §7.3 states the requirement and then says "nothing in this design enforces
	// that" — so this spec is the enforcement. email-prepared-sends-retention deletes
	// token-bearing bytes, and a row is only ELIGIBLE at its predicate: the bytes leave on
	// the sweep's next successful pass. If the cadence is not materially shorter than
	// EMAIL_PREPARED_SWEEP_MAX_LAG_MINUTES, the eligible-to-deleted gap sits in permanent
	// breach of jobs.prepared_state.sweep_overdue and the advertised privacy cap is missed
	// by default rather than by outage. The seeded cron was daily — 24x the threshold.
	// The bound is measured over a FULL recurrence horizon from a deterministic epoch, not
	// from the first two fires after UtcNow.
	[Fact]
	public void ItShouldKeepEverySeededPreparedSendsGapBelowTheMaxSweepLagAcrossAFullLeapYear() {
		using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var seeded = dbContext.SystemJobDefinition
			.AsNoTracking()
			.First(d => d.JobKey == EmailPreparedSendsRetentionHandler.JobKey);
		var cron = new CronExpression(seeded.CronExpression);

		// Fixed epoch inside a LEAP year, spanning a full year so Feb 29 and every
		// month/day-of-week phase is covered — the bound cannot pass or fail by wall clock.
		var epoch = new DateTimeOffset(2024, 1, 1, 0, 0, 0, TimeSpan.Zero);
		var horizonEnd = epoch.AddYears(1);

		var previous = epoch;
		var occurrences = 0;
		var maxGap = TimeSpan.Zero;

		var cursor = cron.GetNextValidTimeAfter(epoch);
		while (cursor is not null && cursor.Value <= horizonEnd) {
			// previous starts at epoch, so the first iteration measures the LEADING edge.
			var gap = cursor.Value - previous;
			if (gap > maxGap) {
				maxGap = gap;
			}

			previous = cursor.Value;
			occurrences++;
			cursor = cron.GetNextValidTimeAfter(cursor.Value);
		}

		// Trailing edge: no long gap may hide between the last in-horizon fire and the end.
		var trailingGap = horizonEnd - previous;
		if (trailingGap > maxGap) {
			maxGap = trailingGap;
		}

		occurrences.Should().BeGreaterThan(
			50_000,
			"a 10-minute cadence owes ~144 passes/day — ~52,704 over a leap year; a cron that "
			+ "stopped recurring would fail here rather than pass vacuously"
		);
		maxGap.Should().BeLessThanOrEqualTo(
			MaxPreparedSweepCadence,
			$"every adjacent gap and both horizon edges must stay at or under "
				+ $"{MaxPreparedSweepCadence.TotalMinutes} min — a quarter of the "
				+ $"{MaxSweepLagMinutes}-minute overdue threshold (§7.3/K-3): the cadence, not "
				+ "the predicate, bounds how long token-bearing bytes stay on disk once eligible"
		);
	}

	[Fact]
	public async Task ItShouldNotDuplicateRowsWhenRunAgain() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var before = await dbContext.SystemJobDefinition
			.CountAsync(d => ExpectedKeys.Contains(d.JobKey));

		var seeder = new SystemJobDefinitionSeeder(
			NullLogger<SystemJobDefinitionSeeder>.Instance
		);
		await seeder.SeedAsync(dbContext, CancellationToken.None);

		var after = await dbContext.SystemJobDefinition
			.CountAsync(d => ExpectedKeys.Contains(d.JobKey));

		after.Should().Be(before, "re-seeding only inserts missing keys — never duplicates");
		before.Should().Be(ExpectedKeys.Length);
	}

	[Fact]
	public async Task ItShouldReinsertAMissingKeyWithDefaultsWhileLeavingOperatorEditsUntouched() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var missingKey = CleanupExpiredSessionsHandler.JobKey;
		var editedKey = EmailLogRetentionHandler.JobKey;
		// A valid Quartz cron distinct from the seeded default — stands in for an operator
		// edit made from the dashboard (#636).
		const string sentinelCron = "0 0 1 1 1 ?";

		var editedOriginal = await dbContext.SystemJobDefinition
			.AsNoTracking()
			.FirstAsync(d => d.JobKey == editedKey);
		var originalCron = editedOriginal.CronExpression;

		var seeder = new SystemJobDefinitionSeeder(
			NullLogger<SystemJobDefinitionSeeder>.Instance
		);

		try {
			// Operator removes one definition entirely and edits another (cron + disable).
			await dbContext.Database.ExecuteSqlAsync(
				$"DELETE FROM system_job_definitions WHERE job_key = {missingKey}"
			);
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				UPDATE system_job_definitions
				SET cron_expression = {sentinelCron}, is_enabled = false
				WHERE job_key = {editedKey}
				"""
			);

			await seeder.SeedAsync(dbContext, CancellationToken.None);

			// The missing key is re-inserted exactly once, with the seeder's defaults.
			var reinserted = await dbContext.SystemJobDefinition
				.AsNoTracking()
				.Where(d => d.JobKey == missingKey && !d.IsDeleted)
				.ToListAsync();
			reinserted.Should().ContainSingle("the missing definition is re-inserted exactly once");
			reinserted[0].CronExpression.Should().Be(
				"0 0 3 * * ?",
				"the re-inserted row carries the seeder's defaults"
			);
			reinserted[0].IsEnabled.Should().BeTrue("the re-inserted row is enabled by default");

			// The operator-edited row is left untouched — the seeder only inserts missing keys.
			var edited = await dbContext.SystemJobDefinition
				.AsNoTracking()
				.FirstAsync(d => d.JobKey == editedKey);
			edited.CronExpression.Should().Be(sentinelCron, "an operator's cron edit is preserved");
			edited.IsEnabled.Should().BeFalse("an operator's disable is preserved");
		} finally {
			// Restore the operator edit independently from missing-row repair.
			try {
				await dbContext.Database.ExecuteSqlAsync(
					$"""
					UPDATE system_job_definitions
					SET cron_expression = {originalCron}, is_enabled = true
					WHERE job_key = {editedKey}
					"""
				);
			} finally {
				await seeder.SeedAsync(dbContext, CancellationToken.None);
			}
		}
	}

	[Fact]
	public async Task ItShouldSkipWhenHistoricalMigrationPredatesSystemJobsThenSeedAtHead() {
		var containerFixture = await PostgresContainerFixture.GetSharedAsync();
		var dbName = $"seeder_migtest_{Guid.NewGuid():N}";

		await using (var adminConnection = new NpgsqlConnection(
			containerFixture.AdminConnectionString
		)) {
			await adminConnection.OpenAsync();
			await using var createCommand = new NpgsqlCommand(
				$"CREATE DATABASE {dbName}",
				adminConnection
			);
			await createCommand.ExecuteNonQueryAsync();
		}

		var connectionString = new NpgsqlConnectionStringBuilder(
			containerFixture.AdminConnectionString
		) {
			Database = dbName,
			Pooling = false,
		}.ConnectionString;

		try {
			await using var dbContext = new AppDbContext(
				new DbContextOptionsBuilder<AppDbContext>()
					.UseNpgsql(connectionString)
					.Options
			);
			var migrator = dbContext.GetService<IMigrator>();
			var seeder = new SystemJobDefinitionSeeder(
				NullLogger<SystemJobDefinitionSeeder>.Instance
			);

			await migrator.MigrateAsync(PreJobsMigrationId);
			(await SystemJobDefinitionsTableExistsAsync(connectionString)).Should().BeFalse();

			var seedHistoricalSchema = async () =>
				await seeder.SeedAsync(dbContext, CancellationToken.None);
			await seedHistoricalSchema.Should().NotThrowAsync(
				"historical-target migration specs run the full seed pipeline before jobs tables exist"
			);
			(await SystemJobDefinitionsTableExistsAsync(connectionString)).Should().BeFalse(
				"the no-op must neither create the table nor insert rows"
			);

			await migrator.MigrateAsync();
			await seeder.SeedAsync(dbContext, CancellationToken.None);

			var seededKeys = await dbContext.SystemJobDefinition
				.AsNoTracking()
				.Select(d => d.JobKey)
				.ToListAsync();
			seededKeys.Should().BeEquivalentTo(ExpectedKeys);
		} finally {
			await using var adminConnection = new NpgsqlConnection(
				containerFixture.AdminConnectionString
			);
			await adminConnection.OpenAsync();
			await using var dropCommand = new NpgsqlCommand(
				$"DROP DATABASE IF EXISTS {dbName}",
				adminConnection
			);
			await dropCommand.ExecuteNonQueryAsync();
		}
	}

	private static async Task<bool> SystemJobDefinitionsTableExistsAsync(
		string connectionString
	) {
		await using var connection = new NpgsqlConnection(connectionString);
		await connection.OpenAsync();
		await using var command = new NpgsqlCommand(
			"SELECT to_regclass('public.system_job_definitions') IS NOT NULL",
			connection
		);
		return await command.ExecuteScalarAsync() is true;
	}
}
