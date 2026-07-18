using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Messaging.Entities;

namespace PublyApp.Api.Modules.Messaging.Services;

/// <summary>
/// The append-only <c>email_log</c> writer the email job handlers call on terminal
/// outcomes (design §4.4/§8). It only ATTACHES the row to the ambient
/// <see cref="AppDbContext"/> (no SaveChanges) so the caller controls the transaction:
/// the handler commits its own send transaction, and the engine commits the terminal
/// <c>OnTerminalFailureAsync</c> write inside the shared DLQ transaction (F5). Scoped,
/// so in a per-job DI scope it shares the handler's context instance.
/// </summary>
public interface IEmailLogWriter {
	void WriteSubmitted(WriteSubmittedEmailLogArgs args);
	void WriteCancelledIneligible(EmailLogEntry entry, string reasonCode);
	void WritePermanentlyFailed(EmailLogEntry entry, string? lastError);
}

/// <summary>
/// The identity of one terminal email outcome, gathered by a handler (design §4.4).
/// Carries no token or body — only the recipient, kind, related ids, and attempt count.
/// </summary>
public sealed record EmailLogEntry {
	public required EmailKind Kind { get; init; }
	public required Guid JobId { get; init; }
	public required string Recipient { get; init; }
	public Guid? InvitationId { get; init; }
	public Guid? UserId { get; init; }
	public int Attempts { get; init; }
}

/// <summary>
/// Args for the Submitted write (service-args convention, #357 A.4): the terminal
/// identity plus the provider correlation the accepted send produced. Collapsed into a
/// record so the writer signature stays stable — the two other outcomes take only
/// <see cref="EmailLogEntry"/> + one string, so they stay positional.
/// </summary>
public sealed record WriteSubmittedEmailLogArgs {
	public required EmailLogEntry Entry { get; init; }
	public string? ProviderMessageId { get; init; }
	public required string RequestSha256 { get; init; }
}

[Service(ServiceLifetime.Scoped)]
public sealed class EmailLogWriter : IEmailLogWriter {
	private readonly AppDbContext _dbContext;

	public EmailLogWriter(AppDbContext dbContext) {
		_dbContext = dbContext;
	}

	public void WriteSubmitted(WriteSubmittedEmailLogArgs args) {
		var row = Build(args.Entry, EmailLogOutcome.Submitted, lastError: null);
		row.ProviderMessageId = args.ProviderMessageId;
		row.RequestSha256 = args.RequestSha256;
		_dbContext.EmailLog.Add(row);
	}

	public void WriteCancelledIneligible(EmailLogEntry entry, string reasonCode) {
		_dbContext.EmailLog.Add(Build(entry, EmailLogOutcome.CancelledIneligible, reasonCode));
	}

	public void WritePermanentlyFailed(EmailLogEntry entry, string? lastError) {
		_dbContext.EmailLog.Add(Build(entry, EmailLogOutcome.PermanentlyFailed, lastError));
	}

	private static EmailLog Build(EmailLogEntry entry, EmailLogOutcome outcome, string? lastError) {
		return new EmailLog {
			JobId = entry.JobId,
			Kind = entry.Kind,
			Recipient = entry.Recipient,
			Outcome = outcome,
			InvitationId = entry.InvitationId,
			UserId = entry.UserId,
			Attempts = entry.Attempts,
			LastError = lastError
		};
	}
}
