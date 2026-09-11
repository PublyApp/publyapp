using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib;

namespace PublyApp.Api.Modules.Messaging.Jobs;

/// <summary>
/// Retention sweep system job (design §7.3, Phase 3) for <c>email_log</c>: hard-deletes
/// delivery records older than <c>EMAIL_LOG_RETENTION_DAYS</c> (default 180; O7) in
/// bounded batches. Recipient addresses are personal data (F20), so this is a privacy
/// control, not just storage hygiene — the window is env-overridable policy.
///
/// Idempotency (F13): the horizon predicate <c>occurred_at &lt; now() - interval</c> is
/// evaluated in SQL against database time (F11); a re-run deletes fewer rows and is
/// harmless. A row exactly AT the horizon is kept (strict <c>&lt;</c>) — only rows
/// strictly beyond the window are swept.
/// </summary>
public sealed class EmailLogRetentionHandler : IJobHandler {
	public const string JobKey = "email-log-retention";

	private const int _BatchSize = 500;

	private readonly AppDbContext _DbContext;
	private readonly ILogger<EmailLogRetentionHandler> _Logger;

	public EmailLogRetentionHandler(
		AppDbContext dbContext,
		ILogger<EmailLogRetentionHandler> logger
	) {
		_DbContext = dbContext;
		_Logger = logger;
	}

	public string JobType {
		get { return JobKey; }
	}

	public async Task<JobOutcome> HandleAsync(
		JobContext context,
		CancellationToken cancellationToken
	) {
		var retentionDays = AppEnvironment.Instance.EMAIL_LOG_RETENTION_DAYS;
		var totalDeleted = 0;
		int deleted;

		do {
			cancellationToken.ThrowIfCancellationRequested();

			deleted = await _DbContext.Database.ExecuteSqlAsync(
				$"""
				DELETE FROM email_log
				WHERE id IN (
					SELECT id FROM email_log
					WHERE occurred_at < now() - make_interval(days => {retentionDays})
					ORDER BY occurred_at, id
					LIMIT {_BatchSize}
					FOR UPDATE SKIP LOCKED
				)
				""",
				cancellationToken
			);

			totalDeleted += deleted;
		} while (deleted == _BatchSize);

		if (totalDeleted > 0 && _Logger.IsEnabled(LogLevel.Information)) {
			_Logger.LogInformation(
				"email-log-retention deleted {Count} row(s) older than {Days} day(s)",
				totalDeleted,
				retentionDays
			);
		}

		return JobOutcome.Succeeded;
	}
}
