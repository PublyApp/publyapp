using Microsoft.EntityFrameworkCore;

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

	/// <summary>
	/// §4.4's single conditioned provider-evidence transition path (#866/K-6): applies an
	/// allowlisted edge to one email_log row and records the transition as an
	/// actor-named <see cref="EmailLogEvidenceEvent"/> row — never as an audit_logs
	/// entry, which is unbuildable for a webhook (user_id NOT NULL FK; a provider has no
	/// user). Owns its transaction: the conditioned update and the evidence row commit
	/// or roll back together. The caller names the author via
	/// <see cref="ApplyProviderEvidenceEmailLogArgs.Actor"/> — a required,
	/// non-nullable <see cref="Entities.EmailLogActor"/> value.
	/// </summary>
	Task<ApplyProviderEvidenceResult> ApplyProviderEvidenceAsync(
		ApplyProviderEvidenceEmailLogArgs args,
		CancellationToken cancellationToken = default
	);
}

/// <summary>
/// Identity + evidence of one §4.4 provider-evidence transition (#866/K-6). Implements
/// <see cref="IEmailLogTransition"/> — the architecture guard enumerates every marker
/// implementor and requires the <see cref="Actor"/> value. A transition without a human
/// actor still names its author: the kind is a controlled-vocabulary value and the
/// correlation id is non-empty and bounded — never null, never "", never a fabricated
/// users.id (#866 round-1: enforced by the type, not by convention).
/// </summary>
public sealed record ApplyProviderEvidenceEmailLogArgs : IEmailLogTransition {
	public required Guid JobId { get; init; }

	// Vocabulary value from EmailLogEvents.
	public required string Event { get; init; }
	public required EmailLogOutcome NewOutcome { get; init; }

	// Provenance stamped onto the email_log row alongside the outcome (§4.4).
	public required string EvidenceSource { get; init; }
	public required string ProviderEventId { get; init; }

	// The named author (#866 round-1): a value object whose Kind is restricted to the
	// EmailLogActorKinds vocabulary and whose Id is non-empty and bounded — an empty or
	// out-of-vocabulary author throws in the constructor, before any database write.
	public required EmailLogActor Actor { get; init; }

	// Bounded, sanitized context (F20); serialized into the evidence row's details.
	public object? Details { get; init; }
}

/// <summary>
/// Discriminated result of <see cref="IEmailLogWriter.ApplyProviderEvidenceAsync"/>
/// (guard-clause friendly): Applied commits the update + evidence row; Rejected means
/// the edge is outside §4.4's forward-only allowlist, lost a race (zero rows affected),
/// or the provider event id is a replay caught by a unique index —
/// <see cref="ApplyProviderEvidenceResult.Rejected.Reason"/>
/// carries the human-readable cause; UnknownTarget means no email_log row matches the
/// given job id.
/// </summary>
public abstract record ApplyProviderEvidenceResult {
	public sealed record Applied : ApplyProviderEvidenceResult;

	public sealed record Rejected(string Reason) : ApplyProviderEvidenceResult;

	public sealed record UnknownTarget : ApplyProviderEvidenceResult;
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

	public async Task<ApplyProviderEvidenceResult> ApplyProviderEvidenceAsync(
		ApplyProviderEvidenceEmailLogArgs args,
		CancellationToken cancellationToken = default
	) {
		await using var transaction =
			await _dbContext.Database.BeginTransactionAsync(cancellationToken);

		var priorOutcome = await FindOutcomeAsync(args.JobId, cancellationToken);
		if (priorOutcome is null) {
			await transaction.RollbackAsync(cancellationToken);
			return new ApplyProviderEvidenceResult.UnknownTarget();
		}

		if (!IsAllowedEdge(priorOutcome.Value, args.NewOutcome)) {
			await transaction.RollbackAsync(cancellationToken);
			return new ApplyProviderEvidenceResult.Rejected($"edge {priorOutcome.Value} "
				+ $"→ {args.NewOutcome} is outside the forward-only allowlist for "
				+ $"job {args.JobId} — terminal outcomes never reverse");
		}

		var emailLogId = await FindIdByJobAsync(args.JobId, cancellationToken);
		if (emailLogId is null) {
			// Unreachable while the read above succeeded inside this transaction; kept as
			// an explicit guard because the FK below needs a real id.
			await transaction.RollbackAsync(cancellationToken);
			return new ApplyProviderEvidenceResult.UnknownTarget();
		}

		// The evidence row is inserted FIRST: a replayed provider event is then rejected
		// by ux_email_log_evidence_events_provider_event_id on THIS table (#866 round-1
		// finding 3 — the explicit index named in §4.4), not incidentally by the parent
		// row's update. Everything commits or rolls back together below.
		_dbContext.EmailLogEvidenceEvent.Add(new EmailLogEvidenceEvent {
			EmailLogId = emailLogId.Value,
			Event = args.Event,
			ActorKind = args.Actor.Kind,
			ActorId = args.Actor.Id,
			PriorOutcome = (int)priorOutcome.Value,
			NewOutcome = (int)args.NewOutcome,
			Details = args.Details is not null
				? System.Text.Json.JsonSerializer.Serialize(args.Details)
				: "{}",
			ProviderEventId = args.ProviderEventId,
		});

		try {
			await _dbContext.SaveChangesAsync(cancellationToken);
		} catch (DbUpdateException ex)
				when (ex.InnerException is Npgsql.PostgresException pgEx
					&& pgEx.SqlState == "23505") {
			await transaction.RollbackAsync(cancellationToken);
			var constraint = string.IsNullOrEmpty(pgEx.ConstraintName)
				? "a provider-event-id unique index"
				: pgEx.ConstraintName;
			return new ApplyProviderEvidenceResult.Rejected(
				$"provider event '{args.ProviderEventId}' was already processed: "
				+ $"{constraint} rejected a duplicate (replayed delivery?)");
		}

		// §4.4's conditioned update, stated in SQL: the predicate RE-CHECKS the current
		// outcome, so an edge racing a concurrent transition affects zero rows instead of
		// clobbering it. The update stamps evidence_source / provider_event_id /
		// updated_at = now() (Npgsql translates UtcNow inside the expression to now()).
		var updatedRows = await _dbContext.EmailLog
			.Where(entry => entry.JobId == args.JobId
				&& entry.Outcome == priorOutcome.Value)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(entry => entry.Outcome, args.NewOutcome)
					.SetProperty(entry => entry.EvidenceSource, args.EvidenceSource)
					.SetProperty(entry => entry.ProviderEventId, args.ProviderEventId)
					.SetProperty(entry => entry.UpdatedAt, entry => DateTime.UtcNow),
				cancellationToken
			);

		if (updatedRows == 0) {
			await transaction.RollbackAsync(cancellationToken);
			return new ApplyProviderEvidenceResult.Rejected($"job {args.JobId}: the "
				+ $"conditioned update matched zero rows — a concurrent transition won "
				+ "the race");
		}

		await transaction.CommitAsync(cancellationToken);

		return new ApplyProviderEvidenceResult.Applied();
	}

	private async Task<EmailLogOutcome?> FindOutcomeAsync(
		Guid jobId,
		CancellationToken cancellationToken
	) {
		return await _dbContext.EmailLog
			.Where(entry => entry.JobId == jobId)
			.Select(entry => (EmailLogOutcome?)entry.Outcome)
			.SingleOrDefaultAsync(cancellationToken);
	}

	private async Task<Guid?> FindIdByJobAsync(Guid jobId, CancellationToken cancellationToken) {
		return await _dbContext.EmailLog
			.Where(entry => entry.JobId == jobId)
			.Select(entry => entry.Id)
			.SingleOrDefaultAsync(cancellationToken);
	}

	// §4.4's forward-only allowlist. Today: legacy-unverified → Submitted on provider
	// acceptance evidence. The Submitted → Delivered|Bounced|Complained edges arrive
	// with the webhook packet's outcome members and extend — never reverse — this map.
	private static bool IsAllowedEdge(EmailLogOutcome current, EmailLogOutcome next) {
		return current == EmailLogOutcome.LegacySubmissionUnverified
			&& next == EmailLogOutcome.Submitted;
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
