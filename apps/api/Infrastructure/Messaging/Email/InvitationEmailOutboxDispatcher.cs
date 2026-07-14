using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Invitations.Entities;

namespace PublyApp.Api.Infrastructure.Messaging.Email;

/// <summary>
/// Delivers durable InvitationEmailOutbox rows written by invitation-creation handlers.
/// Runs on the host's own lifetime token (never a per-request CancellationToken), so a
/// client disconnect or request abort cannot lose a delivery — only a graceful host
/// shutdown pauses it, and any undelivered row is durably persisted and gets retried on
/// the next process start (round-5 API F3).
/// </summary>
public sealed class InvitationEmailOutboxDispatcher : BackgroundService {
	private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(5);
	private const int BatchSize = 20;

	// Public, not private: exercised directly by
	// InvitationEmailOutboxDispatcher.Spec.cs to prove retry/backoff/permanent-failure
	// behavior without depending on ExecuteAsync's poll timing (round-5 API F3, LAW 2).
	public const int MaxAttempts = 8;
	public const int MaxBackoffSeconds = 900;

	private readonly IServiceScopeFactory _scopeFactory;
	private readonly IInvitationEmailOutboxSignal _signal;
	private readonly ILogger<InvitationEmailOutboxDispatcher> _logger;

	public InvitationEmailOutboxDispatcher(
		IServiceScopeFactory scopeFactory,
		IInvitationEmailOutboxSignal signal,
		ILogger<InvitationEmailOutboxDispatcher> logger
	) {
		_scopeFactory = scopeFactory;
		_signal = signal;
		_logger = logger;
	}

	protected override async Task ExecuteAsync(CancellationToken stoppingToken) {
		while (!stoppingToken.IsCancellationRequested) {
			try {
				await ProcessBatchAsync(stoppingToken);
			} catch (Exception ex) when (ex is not OperationCanceledException) {
				_logger.LogError(ex, "Invitation email outbox dispatch loop failed");
			}

			// Wakes early when a writer signals fresh rows; PollInterval is only the
			// fallback that guarantees progress even if a signal is missed or a row
			// was left over from a process restart with nobody around to signal it.
			await _signal.WaitAsync(PollInterval, stoppingToken);
		}
	}

	// A row claimed but never resolved (crashed process between claim and
	// send/save) becomes claimable again after this long (round-6 API F2).
	private static readonly TimeSpan LeaseDuration = TimeSpan.FromMinutes(5);

	// Public: lets specs drive a single batch deterministically instead of racing
	// ExecuteAsync's poll loop (round-5 API F3, LAW 2).
	public async Task ProcessBatchAsync(CancellationToken stoppingToken) {
		using var scope = _scopeFactory.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var emailService = scope.ServiceProvider.GetRequiredService<IEmailService>();

		var claimedIds = await ClaimBatchAsync(dbContext, stoppingToken);
		if (claimedIds.Count == 0) {
			return;
		}

		var batch = await dbContext.InvitationEmailOutbox
			.Where(o => o.Id != null && claimedIds.Contains(o.Id.Value))
			.Include(o => o.Invitation)
			.OrderBy(o => o.CreatedAt)
			.ToListAsync(stoppingToken);

		foreach (var item in batch) {
			await SendOneAsync(dbContext, emailService, item, stoppingToken);
		}
	}

	// Atomically claims up to BatchSize rows in ONE statement — an UPDATE whose
	// WHERE targets a `SELECT ... FOR UPDATE SKIP LOCKED` subquery — so two
	// overlapping dispatcher instances (a rolling deployment's old and new
	// replicas, or two processes racing a poll tick) never both pick up the same
	// row and send a duplicate email (round-6 API F2). A single Postgres
	// statement is atomic on its own; no explicit transaction/second round trip
	// is needed, which also avoids any DateTime-precision ambiguity from trying
	// to re-read "the rows I just claimed" via a separate query. Also reclaims
	// rows abandoned by a dispatcher that crashed mid-lease.
	// Public: lets specs race concurrent claims directly (round-6 API F2, LAW 2).
	public static async Task<List<Guid>> ClaimBatchAsync(
		AppDbContext dbContext,
		CancellationToken stoppingToken
	) {
		var now = DateTime.UtcNow;
		var leaseCutoff = now - LeaseDuration;
		const int pending = (int)InvitationEmailOutboxStatus.Pending;
		const int processing = (int)InvitationEmailOutboxStatus.Processing;

		return await dbContext.Database.SqlQuery<Guid>(
			$"""
			UPDATE invitation_email_outbox
			SET status = {processing}, claimed_at = {now}
			WHERE id IN (
				SELECT id FROM invitation_email_outbox
				WHERE (status = {pending} AND next_attempt_at <= {now})
					OR (status = {processing} AND claimed_at <= {leaseCutoff})
				ORDER BY created_at
				LIMIT {BatchSize}
				FOR UPDATE SKIP LOCKED
			)
			RETURNING id AS "Value"
			"""
		).ToListAsync(stoppingToken);
	}

	// Public: lets specs exercise retry/backoff/permanent-failure behavior on a
	// single row directly, without racing the live background poll loop that also
	// runs against the shared test database (round-5 API F3, LAW 2).
	public async Task SendOneAsync(
		AppDbContext dbContext,
		IEmailService emailService,
		InvitationEmailOutbox item,
		CancellationToken stoppingToken
	) {
		// round-6 API F3: a row can sit Pending/Processing across a revoke or
		// accept that happened between when it was written and when it is finally
		// sent (e.g. the email provider was down and the row backed off). Revoke
		// and accept already cancel matching rows synchronously, but this recheck
		// closes the remaining gaps: rows written before this field existed
		// (Invitation is null — skip the check, unchanged legacy behavior),
		// expiry (no explicit state transition fires for it), and the narrow
		// claim-vs-cancel race window. A row whose invitation is no longer
		// eligible is cancelled here instead of sent.
		if (item.Invitation is { } invitation
			&& (invitation.IsRevoked()
				|| invitation.IsAccepted()
				|| invitation.IsExpired(DateTime.UtcNow))) {
			item.Status = InvitationEmailOutboxStatus.Cancelled;

			if (_logger.IsEnabled(LogLevel.Information)) {
				_logger.LogInformation(
					"Skipped invitation email {OutboxId} to {Email}: invitation {InvitationId} "
					+ "is no longer eligible (status {Status})",
					item.GetRequiredId(),
					item.Email,
					invitation.GetRequiredId(),
					invitation.Status
				);
			}

			await dbContext.SaveChangesAsync(stoppingToken);
			return;
		}

		try {
			if (item.Kind == InvitationEmailKind.TenantInvitation) {
				if (item.TenantName is null || item.AccountLevel is null) {
					throw new InvalidOperationException(
						$"Tenant invitation outbox row {item.GetRequiredId()} is missing "
						+ "TenantName/AccountLevel"
					);
				}

				await emailService.SendTenantInvitationEmailAsync(
					item.Email,
					item.TenantName,
					item.Token,
					item.AccountLevel.Value
				);
			} else {
				await emailService.SendInvitationToJoinStaffEmailAsync(item.Email, item.Token);
			}

			item.Status = InvitationEmailOutboxStatus.Sent;
			item.SentAt = DateTime.UtcNow;

			if (_logger.IsEnabled(LogLevel.Information)) {
				_logger.LogInformation(
					"Delivered invitation email {OutboxId} to {Email}",
					item.GetRequiredId(),
					item.Email
				);
			}
		} catch (Exception ex) {
			item.AttemptCount++;
			item.LastError = ex.Message;

			if (item.AttemptCount >= MaxAttempts) {
				item.Status = InvitationEmailOutboxStatus.Failed;
				_logger.LogError(
					ex,
					"Invitation email {OutboxId} to {Email} permanently failed after {Attempts} attempts",
					item.GetRequiredId(),
					item.Email,
					item.AttemptCount
				);
			} else {
				var delaySeconds = Math.Min(Math.Pow(2, item.AttemptCount), MaxBackoffSeconds);
				item.NextAttemptAt = DateTime.UtcNow.AddSeconds(delaySeconds);

				if (_logger.IsEnabled(LogLevel.Warning)) {
					_logger.LogWarning(
						ex,
						"Failed to deliver invitation email {OutboxId} to {Email} "
						+ "(attempt {Attempt}/{MaxAttempts}), retrying at {NextAttemptAt}",
						item.GetRequiredId(),
						item.Email,
						item.AttemptCount,
						MaxAttempts,
						item.NextAttemptAt
					);
				}
			}
		}

		await dbContext.SaveChangesAsync(stoppingToken);
	}
}
