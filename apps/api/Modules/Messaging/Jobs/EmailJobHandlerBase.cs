using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Modules.Messaging.Entities;
using PublyApp.Api.Modules.Messaging.Services;

namespace PublyApp.Api.Modules.Messaging.Jobs;

/// <summary>
/// What a handler's locked eligibility recheck produced (design §5.4). Either the send
/// is refused (ineligible/no-op) or a rendered envelope is ready to freeze and send.
/// </summary>
public abstract record EmailJobPreparation {
	private EmailJobPreparation() {
	}

	/// <summary>
	/// Committed-before-the-locked-read ineligibility (revoked/accepted/expired, or an
	/// invalid reset token). A <see cref="Recipient"/> present ⇒ an email_log
	/// CancelledIneligible row is written; empty ⇒ the domain row is gone, a silent
	/// no-op with no recipient to record.
	/// </summary>
	public sealed record Ineligible(
		string ReasonCode,
		string Recipient,
		Guid? InvitationId,
		Guid? UserId
	) : EmailJobPreparation;

	/// <summary>Eligible: the frozen-once envelope plus the identity for email_log.</summary>
	public sealed record Ready(
		EmailRequest Envelope,
		string Recipient,
		Guid? InvitationId,
		Guid? UserId
	) : EmailJobPreparation;
}

/// <summary>
/// Best-effort recipient/id identity for an <c>email_log(PermanentlyFailed)</c> row,
/// resolved without a lock when the engine dead-letters a job (design §5.4).
/// </summary>
public sealed record EmailTerminalIdentity(string Recipient, Guid? InvitationId, Guid? UserId);

/// <summary>
/// Shared machinery for the transactional email job handlers (design §5.4, F3/F7/F8).
/// Built to the corrected engine contract: resolved from a FRESH per-job DI scope, so it
/// takes scoped dependencies (<see cref="AppDbContext"/>, sender, log writer) directly,
/// and <see cref="OnTerminalFailureAsync"/> writes through the SAME context the engine's
/// DLQ transaction commits (F5) — no private SaveChanges there.
///
/// Send flow (HandleAsync):
///  0. open a transaction; short-circuit to Success if ANY email_log row for this job
///     already exists — its terminal outcome is recorded (crash-after-send idempotency,
///     and the reclaim-after-CancelledIneligible loop; the job_id index is unique on
///     every outcome, so this check must be too);
///  1. PrepareAsync locks the domain row (FOR UPDATE) and rechecks eligibility — the
///     locked read is the #811 linearization point (F8);
///  2. freeze the envelope once into email_prepared_sends and resend the STORED bytes
///     with the job-stable provider idempotency key (F7);
///  3a. still under the lock, re-read email_log as the LAST thing before the provider
///     call: a Submitted row now present means a concurrent worker already sent — skip
///     the provider and return Success (R2-2);
///  4. on acceptance: email_log(Submitted) + delete scratch + commit → Success;
///  5. on classified failure: commit (persist the frozen envelope for the next attempt)
///     and return Retry/PermanentFailure — the engine owns backoff (#810).
/// Error strings are stable PII-free codes (F20).
/// </summary>
public abstract class EmailJobHandlerBase<TPayload> : IJobHandler {
	private static readonly JsonSerializerOptions EnvelopeJson = new(JsonSerializerDefaults.Web);

	protected AppDbContext Db { get; }
	private readonly IEmailSender _sender;
	private readonly IEmailLogWriter _logWriter;
	private readonly JobsMetrics _metrics;

	protected EmailJobHandlerBase(
		AppDbContext db,
		IEmailSender sender,
		IEmailLogWriter logWriter,
		JobsMetrics metrics
	) {
		Db = db;
		_sender = sender;
		_logWriter = logWriter;
		_metrics = metrics;
	}

	public abstract string JobType { get; }
	protected abstract EmailKind Kind { get; }

	/// <summary>
	/// Locks the domain row (FOR UPDATE), rechecks eligibility, and renders the envelope.
	/// </summary>
	protected abstract Task<EmailJobPreparation> PrepareAsync(
		TPayload payload,
		CancellationToken cancellationToken
	);

	/// <summary>
	/// Best-effort recipient/ids for a terminal email_log row without taking a lock.
	/// </summary>
	protected abstract Task<EmailTerminalIdentity> ResolveTerminalIdentityAsync(
		TPayload payload,
		CancellationToken cancellationToken
	);

	public async Task<JobOutcome> HandleAsync(
		JobContext context,
		CancellationToken cancellationToken
	) {
		var payload = context.DeserializePayload<TPayload>();
		var jobId = context.JobId;

		await using var transaction = await Db.Database.BeginTransactionAsync(cancellationToken);

		// Step 0 (§5.4): if ANY email_log row is already committed for this job, its
		// terminal outcome is recorded — return Success without sending.
		//
		// The predicate must match EVERY outcome, not just Submitted. ux_email_log_job_id
		// (§4.4) is unique on all outcomes, and an ineligible job commits its
		// CancelledIneligible row BEFORE the engine's fenced queue delete. A lease lost in
		// that window reclaims the row with the Cancelled row already committed: a
		// Submitted-only check would not match it, the re-run would take the ineligible
		// path again, and WriteCancelledIneligible would violate the unique index on every
		// attempt — Retry until MaxAttempts, then the same violation inside the DLQ
		// transaction (the terminal hook writes PermanentlyFailed for the same job_id),
		// rollback, Faulted, lease never released. That is the #810 infinite-lease
		// signature; the broad check is what closes it.
		var loggedQuery =
			from entry in Db.EmailLog
			where entry.JobId == jobId
			select entry;
		var alreadyLogged = await loggedQuery.AnyAsync(cancellationToken);
		if (alreadyLogged) {
			await transaction.CommitAsync(cancellationToken);
			return JobOutcome.Succeeded;
		}

		var preparation = await PrepareAsync(payload, cancellationToken);

		if (preparation is EmailJobPreparation.Ineligible ineligible) {
			if (ineligible.Recipient.Length > 0) {
				_logWriter.WriteCancelledIneligible(
					new EmailLogEntry {
						Kind = Kind,
						JobId = jobId,
						Recipient = ineligible.Recipient,
						InvitationId = ineligible.InvitationId,
						UserId = ineligible.UserId,
						Attempts = context.Attempts
					},
					ineligible.ReasonCode
				);
			}

			await DeletePreparedSendAsync(jobId, cancellationToken);
			await Db.SaveChangesAsync(cancellationToken);
			await transaction.CommitAsync(cancellationToken);
			return new JobOutcome.Cancelled(ineligible.ReasonCode);
		}

		var ready = (EmailJobPreparation.Ready)preparation;
		var prepared = await FreezeAndReadEnvelopeAsync(jobId, ready.Envelope, cancellationToken);

		EmailSendReceipt receipt;
		try {
			var request = JsonSerializer.Deserialize<EmailRequest>(prepared.Envelope, EnvelopeJson);
			if (request is null) {
				throw new EmailProviderPermanentException("prepared_envelope_corrupt");
			}

			// Step 3a (§5.4, R2-2): still holding the domain lock, the LAST thing before
			// network I/O. Two workers can both pass step 0 before either takes the SEND
			// lock; the fencing token settles the queue row but not an EXTERNAL double
			// send. The domain lock serializes the two SEND transactions, so the second
			// observes the first's committed Submitted row here and skips the provider.
			// (A local optimization — the provider idempotency key remains the
			// cross-process backstop for the crash-after-send window.)
			if (await SubmittedEmailLogExistsAsync(jobId, cancellationToken)) {
				await DeletePreparedSendAsync(jobId, cancellationToken);
				await transaction.CommitAsync(cancellationToken);
				return JobOutcome.Succeeded;
			}

			receipt = await _sender.SendAsync(request, prepared.ProviderIdempotencyKey, cancellationToken);
		} catch (EmailProviderTransientException ex) {
			_metrics.EmailSubmitFailure(Kind.ToString(), "transient");
			// Persist the frozen envelope so the next attempt resends identical bytes.
			await transaction.CommitAsync(cancellationToken);
			return new JobOutcome.Retry(ex.RetryAfter, ex.Code);
		} catch (EmailProviderPermanentException ex) {
			_metrics.EmailSubmitFailure(Kind.ToString(), "permanent");
			await transaction.CommitAsync(cancellationToken);
			return new JobOutcome.PermanentFailure(ex.Code);
		}

		_logWriter.WriteSubmitted(
			new WriteSubmittedEmailLogArgs {
				Entry = new EmailLogEntry {
					Kind = Kind,
					JobId = jobId,
					Recipient = ready.Recipient,
					InvitationId = ready.InvitationId,
					UserId = ready.UserId,
					Attempts = context.Attempts + 1
				},
				ProviderMessageId = receipt.ProviderMessageId,
				RequestSha256 = prepared.RequestSha256
			}
		);

		await DeletePreparedSendAsync(jobId, cancellationToken);
		await Db.SaveChangesAsync(cancellationToken);
		await transaction.CommitAsync(cancellationToken);
		return JobOutcome.Succeeded;
	}

	// Runs INSIDE the engine's DLQ transaction on the SHARED context (F5): write the
	// PermanentlyFailed row and delete the scratch; the engine's SaveChanges + commit
	// persists them atomically with the DLQ insert and queue delete. No commit here.
	public async Task OnTerminalFailureAsync(JobContext context, CancellationToken cancellationToken) {
		EmailTerminalIdentity identity;
		try {
			var payload = context.DeserializePayload<TPayload>();
			identity = await ResolveTerminalIdentityAsync(payload, cancellationToken);
		} catch (JsonException) {
			// The engine already classified this payload as permanently malformed. Repeating
			// that failure here would poison the DLQ transaction forever, so retain the job
			// identity and kind while using an explicit placeholder for unavailable fields.
			identity = new EmailTerminalIdentity("(unknown)", null, null);
		}

		_logWriter.WritePermanentlyFailed(
			new EmailLogEntry {
				Kind = Kind,
				JobId = context.JobId,
				Recipient = identity.Recipient,
				InvitationId = identity.InvitationId,
				UserId = identity.UserId,
				Attempts = context.Attempts + 1
			},
			context.LastError
		);

		await DeletePreparedSendAsync(context.JobId, cancellationToken);
	}

	// FOR UPDATE row lock on the domain table (the linearization point, F8). The table
	// name is a per-handler constant literal, never user input; the id is parameterized.
	protected async Task LockRowAsync(string table, Guid id, CancellationToken cancellationToken) {
		// EF1002 suppressed with justification: `table` is a trusted per-handler CONSTANT
		// literal ("invitations"/"users"), never user input, and `id` is a bound
		// parameter ({0}). This is the only way to express SELECT ... FOR UPDATE in EF.
#pragma warning disable EF1002, EF1003
		await Db.Database.ExecuteSqlRawAsync(
			"SELECT 1 FROM " + table + " WHERE id = {0} FOR UPDATE",
			[id],
			cancellationToken
		);
#pragma warning restore EF1002, EF1003
	}

	// Freeze the rendered envelope once (F7): INSERT ... ON CONFLICT DO NOTHING, then read
	// back the stored row so retries send byte-identical bytes under a stable key.
	private async Task<EmailPreparedSend> FreezeAndReadEnvelopeAsync(
		Guid jobId,
		EmailRequest envelope,
		CancellationToken cancellationToken
	) {
		var envelopeJson = JsonSerializer.Serialize(envelope, EnvelopeJson);
		var sha256 = Sha256Hex(envelopeJson);
		var idempotencyKey = jobId.ToString("N");

		await Db.Database.ExecuteSqlAsync(
			$"""
			INSERT INTO email_prepared_sends
				(job_id, envelope, request_sha256, provider_idempotency_key, prepared_at)
			VALUES ({jobId}, {envelopeJson}::jsonb, {sha256}, {idempotencyKey}, now())
			ON CONFLICT (job_id) DO NOTHING
			""",
			cancellationToken
		);

		var storedQuery =
			from preparedSend in Db.EmailPreparedSend.AsNoTracking()
			where preparedSend.JobId == jobId
			select preparedSend;
		var stored = await storedQuery.FirstOrDefaultAsync(cancellationToken);
		if (stored is null) {
			throw new InvalidOperationException(
				$"email_prepared_sends row for job {jobId} was not found after insert."
			);
		}

		return stored;
	}

	// Step 3a's read (§5.4): has a concurrent SEND transaction already committed the
	// provider-accepted outcome for this job? Narrower than step 0 on purpose — only a
	// Submitted row proves the provider was already called for these bytes.
	private async Task<bool> SubmittedEmailLogExistsAsync(
		Guid jobId,
		CancellationToken cancellationToken
	) {
		var query =
			from entry in Db.EmailLog
			where entry.JobId == jobId && entry.Outcome == EmailLogOutcome.Submitted
			select entry;
		return await query.AnyAsync(cancellationToken);
	}

	private async Task DeletePreparedSendAsync(Guid jobId, CancellationToken cancellationToken) {
		var preparedSendQuery =
			from preparedSend in Db.EmailPreparedSend
			where preparedSend.JobId == jobId
			select preparedSend;
		await preparedSendQuery.ExecuteDeleteAsync(cancellationToken);
	}

	private static string Sha256Hex(string value) {
		var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
		return Convert.ToHexStringLower(bytes);
	}
}
