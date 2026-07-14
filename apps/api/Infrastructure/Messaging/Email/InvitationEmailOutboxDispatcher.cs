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
	private const int MaxAttempts = 8;
	private const int MaxBackoffSeconds = 900;

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

	private async Task ProcessBatchAsync(CancellationToken stoppingToken) {
		using var scope = _scopeFactory.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var emailService = scope.ServiceProvider.GetRequiredService<IEmailService>();

		var now = DateTime.UtcNow;
		var batch = await dbContext.InvitationEmailOutbox
			.Where(o => o.Status == InvitationEmailOutboxStatus.Pending && o.NextAttemptAt <= now)
			.OrderBy(o => o.CreatedAt)
			.Take(BatchSize)
			.ToListAsync(stoppingToken);

		foreach (var item in batch) {
			await SendOneAsync(dbContext, emailService, item, stoppingToken);
		}
	}

	private async Task SendOneAsync(
		AppDbContext dbContext,
		IEmailService emailService,
		InvitationEmailOutbox item,
		CancellationToken stoppingToken
	) {
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
