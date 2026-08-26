using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data;
using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Auth.Jobs;
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Jobs.Jobs;
using PublyApp.Api.Modules.Messaging.Jobs;
using PublyApp.Api.Modules.Uploads.Jobs;

namespace PublyApp.Api.Modules.Jobs.Seeders;

/// <summary>
/// Seeds the first <c>system_job_definitions</c> rows (design §5.3/§7.3, Phase 3). Each
/// row's <c>job_key</c> equals the corresponding <c>IJobHandler.JobType</c>:
/// <c>SyncSystemJobsJob</c> reconciles the enabled rows into Quartz cron triggers, whose
/// <c>EnqueueSystemJobJob</c> inserts a <c>job_queue</c> row with
/// <c>job_type = job_key</c>, which the processor dispatches to the matching handler.
///
/// Seed rows are config, NOT schema — they go through this seeder (the repo's seeder
/// convention), never a migration, so operators can retune cron/enable from the dashboard
/// (#636) without a code deploy. Idempotent: only missing <c>job_key</c>s are inserted, so
/// re-seeding never duplicates or overwrites an operator's dashboard edits.
///
/// Cron defaults are staggered off-peak, with one deliberate exception:
/// <c>email-prepared-sends-retention</c> runs every 10 minutes because its cadence is a
/// privacy control, not housekeeping (§7.3/K-3 — see the row's own note). The retention
/// windows themselves come from <c>*_RETENTION_DAYS</c> env vars (the sweeps read them),
/// so only the CADENCE lives here.
/// </summary>
public class SystemJobDefinitionSeeder : IEntitySeeder {
	private readonly ILogger<SystemJobDefinitionSeeder> _logger;

	public SystemJobDefinitionSeeder(ILogger<SystemJobDefinitionSeeder>? logger = null) {
		_logger = logger ?? SeederLoggerUtils.CreateDefault<SystemJobDefinitionSeeder>();
	}

	// After the core reference data (permissions 10 … user accounts 40); these rows have
	// no FK dependencies, so any late order is safe.
	public int Order {
		get { return 50; }
	}

	public async Task SeedAsync(
		AppDbContext dbContext,
		CancellationToken cancellationToken = default
	) {
		// Historical-target migration specs run the full seed pipeline even when the target
		// predates the jobs tables. Skip until this seeder's schema has been migrated in.
		var tableExists = await dbContext.Database
			.SqlQueryRaw<bool>(
				"SELECT to_regclass('public.system_job_definitions') IS NOT NULL AS \"Value\""
			)
			.SingleAsync(cancellationToken);
		if (!tableExists) {
			return;
		}

		var definitions = GetDefinitions();

		var existingKeys = await (
			from definition in dbContext.SystemJobDefinition
			select definition.JobKey
		).ToListAsync(cancellationToken);

		var missing = definitions
			.Where(d => !existingKeys.Contains(d.JobKey))
			.ToList();

		if (missing.Count == 0) {
			_logger.LogInformation(
				"System job definition seeding skipped; all definitions already exist."
			);
			return;
		}

		var insertedCount = 0;
		foreach (var definition in missing) {
			insertedCount += await dbContext.Database.ExecuteSqlAsync(
				$"""
				INSERT INTO system_job_definitions (
					job_key, cron_expression, is_enabled, description
				)
				VALUES (
					{definition.JobKey},
					{definition.CronExpression},
					{definition.IsEnabled},
					{definition.Description}
				)
				ON CONFLICT (job_key) WHERE is_deleted = false DO NOTHING
				""",
				cancellationToken
			);
		}

		if (insertedCount > 0 && _logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation("Seeded {Count} system job definition(s).", insertedCount);
		}
	}

	// Code-defined desired state for a system job definition, exposed for the #1349
	// whole-definition protection restore in SyncSystemJobsJob: when a protected
	// definition drifts from this source of truth (an invalid or emptied cron), the
	// reconcile reverts it to these values instead of honoring the corruption.
	internal static IReadOnlyList<SystemJobDefinition> GetCodeDefinedDefaults() {
		return GetDefinitions();
	}

	private static List<SystemJobDefinition> GetDefinitions() {
		return [
			new SystemJobDefinition {
				JobKey = CleanupExpiredSessionsHandler.JobKey,
				IsEnabled = true,
				// Daily at 03:00 (sec min hour day month dow).
				CronExpression = "0 0 3 * * ?",
				Description = "Hard-delete expired sessions in bounded batches (#389).",
			},
			new SystemJobDefinition {
				JobKey = EmailLogRetentionHandler.JobKey,
				IsEnabled = true,
				// Daily at 03:30.
				CronExpression = "0 30 3 * * ?",
				Description =
					"Delete email_log rows older than EMAIL_LOG_RETENTION_DAYS (privacy).",
			},
			new SystemJobDefinition {
				JobKey = DeadLetterRetentionHandler.JobKey,
				IsEnabled = true,
				// Daily at 04:00.
				CronExpression = "0 0 4 * * ?",
				Description =
					"Delete job_dead_letter rows older than JOB_DEAD_LETTER_RETENTION_DAYS.",
			},
			new SystemJobDefinition {
				JobKey = SystemJobOccurrenceRetentionHandler.JobKey,
				IsEnabled = true,
				// Daily at 04:15, staggered after the dead-letter sweep.
				CronExpression = "0 15 4 * * ?",
				Description =
					"Delete system_job_occurrences rows older than "
					+ "SYSTEM_JOB_OCCURRENCE_RETENTION_DAYS.",
			},
			new SystemJobDefinition {
				JobKey = EmailPreparedSendsRetentionHandler.JobKey,
				IsEnabled = true,
				// Every 10 minutes — NOT daily like the sweeps above, and the difference is
				// load-bearing (design §7.3/K-3). This sweep is the only privacy-load-bearing
				// one: it deletes token-bearing bytes, and §7.3 requires a cadence "materially
				// shorter than EMAIL_PREPARED_SWEEP_MAX_LAG_MINUTES" (default 60) because a row
				// is only eligible at its predicate — the bytes actually leave on the next
				// successful pass. A daily cadence made that gap up to 24 h wide and could
				// leave the gap above the limit even without an outage.
				CronExpression = "0 0/10 * * * ?",
				Description =
					"Delete orphaned email_prepared_sends scratch rows (live-state anti-join) "
					+ "past the EMAIL_PREPARED_SEND_RETENTION_DAYS floor. Runs every 10 min: "
					+ "the cadence must stay materially under EMAIL_PREPARED_SWEEP_MAX_LAG_MINUTES.",
			},
			new SystemJobDefinition {
				JobKey = UploadOrphanReclaimerHandler.JobKey,
				IsEnabled = true,
				// Hourly at :20, staggered off the other sweeps' daily slots. The
				// reclaimer is capacity-recovery, not just housekeeping: committed
				// bytes stay blocked until it runs, so a daily cadence would let a
				// replace-heavy day pin up to a day of storage. An hour bounds how
				// long reclaimed capacity stays invisible to admission.
				CronExpression = "0 20 * * * ?",
				Description =
					"Reclaim orphaned upload blobs past UPLOAD_ORPHAN_GRACE_DAYS "
					+ "(releases committed_bytes) and stale Reserved rows past "
					+ "UPLOAD_STALE_RESERVATION_TTL_MINUTES (releases reserved_bytes).",
			},
		];
	}
}
