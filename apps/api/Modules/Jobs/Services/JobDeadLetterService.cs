using System.Text.Json;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Jobs.Entities;

namespace PublyApp.Api.Modules.Jobs.Services;

public sealed record ResolveDeadLetterUnclassifiedArgs(
	Guid DeadLetterId,
	Guid OperatorStaffId,
	string? Note
);

public interface IJobDeadLetterService {
	/// <summary>
	/// Outcome of a conditional external-state resolution attempt.
	/// </summary>
	Task<ResolveDeadLetterUnclassifiedResult> ResolveUnclassifiedAsync(
		ResolveDeadLetterUnclassifiedArgs args,
		CancellationToken cancellationToken = default
	);
}

/// <summary>
/// Result discriminated union for <see cref="IJobDeadLetterService.ResolveUnclassifiedAsync"/>.
/// Handlers pattern-match with flat guards (C# coding standards).
/// </summary>
public abstract record ResolveDeadLetterUnclassifiedResult {
	/// <summary>Transition 6 Unclassified → 4 Missing committed; carries the new row id.</summary>
	public sealed record Resolved(Guid EventId) : ResolveDeadLetterUnclassifiedResult;

	/// <summary>No dead-letter row exists for the id.</summary>
	public sealed record NotFound : ResolveDeadLetterUnclassifiedResult;

	/// <summary>The row exists but its external_state_status is not 6; carries the current state.</summary>
	public sealed record NotUnclassified(ExternalStateStatus CurrentStatus) : ResolveDeadLetterUnclassifiedResult;
}

/// <summary>
/// Domain service for job_dead_letter triage (K-1, issue #863). Owns the ONLY
/// sanctioned write path that moves a row OUT of status 6 Unclassified today:
/// the operator-confirmed-absent resolution stamping 4 Missing. Services depend on
/// DbContext + infrastructure only — no other domain services.
/// </summary>
[Service(ServiceLifetime.Scoped)]
public class JobDeadLetterService : IJobDeadLetterService {
	private readonly AppDbContext _dbContext;

	public JobDeadLetterService(AppDbContext dbContext) {
		_dbContext = dbContext;
	}

	public async Task<ResolveDeadLetterUnclassifiedResult> ResolveUnclassifiedAsync(
		ResolveDeadLetterUnclassifiedArgs args,
		CancellationToken cancellationToken = default
	) {
		var now = DateTime.UtcNow;

		// Read the lineage needed by the event row BEFORE the conditional transition:
		// after it, a concurrent resolver may have already moved the row on.
		var lineage = await _dbContext.JobDeadLetter
			.AsNoTracking()
			.Where(d => d.Id == args.DeadLetterId)
			.Select(d => new { d.OriginalJobId, d.JobType, d.ExternalStateStatus })
			.FirstOrDefaultAsync(cancellationToken);

		if (lineage is null) {
			return new ResolveDeadLetterUnclassifiedResult.NotFound();
		}

		if (lineage.ExternalStateStatus != (int)ExternalStateStatus.Unclassified) {
			return new ResolveDeadLetterUnclassifiedResult.NotUnclassified(
				(ExternalStateStatus)lineage.ExternalStateStatus
			);
		}

		// Single-statement conditional transition: the UPDATE only fires while the row
		// is still 6 Unclassified, so a concurrent resolver loses the race cleanly
		// (zero rows affected) instead of double-writing. Recorded bounds are kept —
		// they describe WHEN effects were believed to exist, which is evidence, not
		// something an operator edit should erase.
		var updated = await _dbContext.Database.ExecuteSqlAsync(
			$"""
			UPDATE job_dead_letter
			SET external_state_status = {(int)ExternalStateStatus.Missing},
			    external_state_expired_at = NULL
			WHERE id = {args.DeadLetterId}
			  AND external_state_status = {(int)ExternalStateStatus.Unclassified}
			""",
			cancellationToken
		);

		if (updated == 0) {
			// A concurrent resolver won the race between our read and our UPDATE.
			// Re-read so the handler can fail closed with the actual current state.
			var racedStatus = await _dbContext.JobDeadLetter
				.AsNoTracking()
				.Where(d => d.Id == args.DeadLetterId)
				.Select(d => (ExternalStateStatus?)d.ExternalStateStatus)
				.FirstOrDefaultAsync(cancellationToken);

			return racedStatus.HasValue
				? new ResolveDeadLetterUnclassifiedResult.NotUnclassified(racedStatus.Value)
				: new ResolveDeadLetterUnclassifiedResult.NotFound();
		}

		var eventId = Guid.NewGuid();

		_dbContext.JobDeadLetterEvent.Add(new JobDeadLetterEvent {
			DeadLetterId = args.DeadLetterId,
			Event = JobDeadLetterEvents.MissingConfirmed,
			DetectedBy = "operator",
			PriorStatus = (int)ExternalStateStatus.Unclassified,
			NewStatus = (int)ExternalStateStatus.Missing,
			Details = JsonSerializer.Serialize(new {
				originalJobId = lineage.OriginalJobId,
				jobType = lineage.JobType,
				reason = "operator_confirmed_absent",
				note = args.Note
			}),
			OccurredAt = now
		});

		await _dbContext.SaveChangesAsync(cancellationToken);

		return new ResolveDeadLetterUnclassifiedResult.Resolved(eventId);
	}
}
