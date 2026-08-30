using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Jobs.Entities;

using Quartz;

namespace PublyApp.Api.Modules.Jobs.Services;

public record FindSystemJobDefinitionsArgs(
	Guid Cursor,
	int? Limit,
	bool? IsEnabled
);

public abstract record FindSystemJobDefinitionsResult {
	public sealed record Success(
		CursorPaginatedResult<SystemJobDefinitionListItem> Data
	) : FindSystemJobDefinitionsResult;
}

public record SystemJobDefinitionListItem {
	public required Guid Id { get; init; }
	public required string JobKey { get; init; }
	public required string CronExpression { get; init; }
	public required bool IsEnabled { get; init; }
	public DateTime? LastEnqueuedAt { get; init; }
	public required DateTime UpdatedAt { get; init; }
}

public record SystemJobOccurrenceItem {
	public required Guid EnqueuedJobId { get; init; }
	public required DateTime ScheduledFireAt { get; init; }
	public required DateTime EnqueuedAt { get; init; }
}

public record SystemJobDefinitionDetail {
	public required Guid Id { get; init; }
	public required string JobKey { get; init; }
	public required string CronExpression { get; init; }
	public required Guid ScheduleEpoch { get; init; }
	public required bool IsEnabled { get; init; }
	public string? Description { get; init; }
	public DateTime? LastEnqueuedAt { get; init; }
	public required IReadOnlyList<SystemJobOccurrenceItem> RecentOccurrences { get; init; }
	public required DateTime CreatedAt { get; init; }
	public required DateTime UpdatedAt { get; init; }
}

public sealed record UpdateSystemJobEnabledArgs(
	Guid DefinitionId,
	bool IsEnabled
);

public abstract record UpdateSystemJobEnabledResult {
	/// <summary>The flip landed; carries the new state.</summary>
	public sealed record Success(Guid Id, bool IsEnabled) : UpdateSystemJobEnabledResult;

	/// <summary>No live definition carries the id.</summary>
	public sealed record NotFound : UpdateSystemJobEnabledResult;

	/// <summary>K-3: this key's retention cadence IS a privacy control (handler maps to 409).</summary>
	public sealed record ProtectedKey : UpdateSystemJobEnabledResult;
}

public sealed record UpdateSystemJobCronArgs(
	Guid DefinitionId,
	string NewCronExpression
);

public abstract record UpdateSystemJobCronResult {
	/// <summary>Cron persisted; schedule_epoch returned UNCHANGED by design.</summary>
	public sealed record Success(
		Guid Id,
		string CronExpression,
		Guid ScheduleEpoch
	) : UpdateSystemJobCronResult;

	/// <summary>No live definition carries the id.</summary>
	public sealed record NotFound : UpdateSystemJobCronResult;

	/// <summary>Quartz rejects the expression; nothing was written.</summary>
	public sealed record InvalidCron : UpdateSystemJobCronResult;
}

public sealed record TriggerSystemJobArgs(Guid DefinitionId);

/// <summary>
/// Result discriminated union for trigger-now (#636). The disabled-key case is a
/// 200 NoOp at the handler, NOT a 404 — the row exists, it just refused.
/// </summary>
public abstract record TriggerSystemJobResult {
	public sealed record Enqueued(
		Guid JobId,
		DateTime ScheduledFireAt,
		Guid ScheduleEpoch
	) : TriggerSystemJobResult;

	public sealed record NotFound : TriggerSystemJobResult;

	public sealed record NoOp : TriggerSystemJobResult;
}

public interface ISystemJobDefinitionQueryService {
	Task<FindSystemJobDefinitionsResult> FindAsync(
		FindSystemJobDefinitionsArgs args,
		CancellationToken cancellationToken = default
	);

	Task<SystemJobDefinitionDetail?> GetByIdAsync(
		Guid id,
		CancellationToken cancellationToken = default
	);

	Task<UpdateSystemJobEnabledResult> UpdateEnabledAsync(
		UpdateSystemJobEnabledArgs args,
		CancellationToken cancellationToken = default
	);

	Task<UpdateSystemJobCronResult> UpdateCronAsync(
		UpdateSystemJobCronArgs args,
		CancellationToken cancellationToken = default
	);

	Task<TriggerSystemJobResult> TriggerNowAsync(
		TriggerSystemJobArgs args,
		CancellationToken cancellationToken = default
	);
}

/// <summary>
/// Staff system-job dashboard reads + mutations (#636). Every mutation is a
/// single-statement conditional UPDATE (engine style). The NO-DOUBLE-ROTATION
/// contract lives here: <see cref="UpdateCronAsync"/> persists ONLY the cron and
/// returns the UNCHANGED schedule_epoch — SyncSystemJobsJob is the
/// sole writer of schedule_epoch, so the next reconcile rotates it when it
/// sees the mismatch. Rotating here would leave the live Quartz trigger carrying a
/// retired epoch and every fire rejected for up to one sync period.
/// </summary>
[Service(ServiceLifetime.Scoped)]
public class SystemJobDefinitionQueryService(
	AppDbContext dbContext,
	IEnqueueSystemJobBoundary enqueueBoundary
) : ISystemJobDefinitionQueryService {
	private const int RecentOccurrenceCount = 10;

	public async Task<FindSystemJobDefinitionsResult> FindAsync(
		FindSystemJobDefinitionsArgs args,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit = args.Limit
			?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;

		var query =
			from definition in dbContext.SystemJobDefinition.AsNoTracking()
			where !definition.IsDeleted
			select definition;

		if (args.IsEnabled.HasValue) {
			var wanted = args.IsEnabled.Value;
			query =
				from definition in query
				where definition.IsEnabled == wanted
				select definition;
		}

		IQueryable<SystemJobDefinition> page = query;
		if (args.Cursor != Guid.Empty) {
			var cursorRow = await (
				from definition in
					from candidate in dbContext.SystemJobDefinition.AsNoTracking()
					where !candidate.IsDeleted
					select candidate
				where definition.Id == args.Cursor
				select new { definition.UpdatedAt, definition.Id }
			).FirstOrDefaultAsync(cancellationToken);
			if (cursorRow is null || cursorRow.Id is null) {
				return new FindSystemJobDefinitionsResult.Success(
					new CursorPaginatedResult<SystemJobDefinitionListItem>()
				);
			}

			var cursorUpdatedAt = cursorRow.UpdatedAt;
			page =
				from definition in page
				where definition.UpdatedAt < cursorUpdatedAt
					|| (definition.UpdatedAt == cursorUpdatedAt
						&& definition.Id < args.Cursor)
				select definition;
		}

		var rows = await (
			from definition in page
			orderby definition.UpdatedAt descending, definition.Id descending
			select definition
		).Take(effectiveLimit + 1).Select(definition => new {
			definition.Id,
			definition.JobKey,
			definition.CronExpression,
			definition.IsEnabled,
			definition.LastEnqueuedAt,
			definition.UpdatedAt,
		}).ToListAsync(cancellationToken);

		string? nextCursor = null;
		if (rows.Count > effectiveLimit) {
			rows.RemoveAt(rows.Count - 1);
			nextCursor = rows.Last().Id.ToString();
		}

		return new FindSystemJobDefinitionsResult.Success(
			new CursorPaginatedResult<SystemJobDefinitionListItem> {
				Data = rows.Select(row => new SystemJobDefinitionListItem {
					Id = row.Id ?? Guid.Empty,
					JobKey = row.JobKey,
					CronExpression = row.CronExpression,
					IsEnabled = row.IsEnabled,
					LastEnqueuedAt = row.LastEnqueuedAt,
					UpdatedAt = row.UpdatedAt,
				}).ToList(),
				NextCursor = nextCursor,
			}
		);
	}

	public async Task<SystemJobDefinitionDetail?> GetByIdAsync(
		Guid id,
		CancellationToken cancellationToken = default
	) {
		var detail = await (
			from definition in dbContext.SystemJobDefinition.AsNoTracking()
			where definition.Id == id && !definition.IsDeleted
			select new SystemJobDefinitionDetail {
				Id = definition.Id ?? Guid.Empty,
				JobKey = definition.JobKey,
				CronExpression = definition.CronExpression,
				ScheduleEpoch = definition.ScheduleEpoch,
				IsEnabled = definition.IsEnabled,
				Description = definition.Description,
				LastEnqueuedAt = definition.LastEnqueuedAt,
				RecentOccurrences = Array.Empty<SystemJobOccurrenceItem>(),
				CreatedAt = definition.CreatedAt,
				UpdatedAt = definition.UpdatedAt,
			}
		).FirstOrDefaultAsync(cancellationToken);

		if (detail is null) {
			return null;
		}

		var occurrences = await (
			from occurrence in dbContext.SystemJobOccurrence.AsNoTracking()
			where occurrence.JobKey == detail.JobKey
			orderby occurrence.ScheduledFireAt descending
			select new SystemJobOccurrenceItem {
				EnqueuedJobId = occurrence.EnqueuedJobId ?? Guid.Empty,
				ScheduledFireAt = occurrence.ScheduledFireAt,
				EnqueuedAt = occurrence.EnqueuedAt,
			}
		).Take(RecentOccurrenceCount).ToListAsync(cancellationToken);

		return detail with { RecentOccurrences = occurrences };
	}

	public async Task<UpdateSystemJobEnabledResult> UpdateEnabledAsync(
		UpdateSystemJobEnabledArgs args,
		CancellationToken cancellationToken = default
	) {
		// K-3 pre-check: the sync's RestoreProtectedDefinitionsAsync would revert
		// the write anyway within 60s; refusing here makes the refusal immediate
		// and honest instead of silently undone.
		var jobKey = await (
			from definition in dbContext.SystemJobDefinition.AsNoTracking()
			where definition.Id == args.DefinitionId && !definition.IsDeleted
			select definition.JobKey
		).FirstOrDefaultAsync(cancellationToken);
		if (jobKey is null) {
			return new UpdateSystemJobEnabledResult.NotFound();
		}

		if (!args.IsEnabled && SystemJobDisableProtection.IsDisableProtected(jobKey)) {
			return new UpdateSystemJobEnabledResult.ProtectedKey();
		}

		var updated = await dbContext.Database.ExecuteSqlAsync(
			$"""
			UPDATE system_job_definitions
			SET is_enabled = {args.IsEnabled},
			    updated_at = now()
			WHERE id = {args.DefinitionId} AND is_deleted = false
			""",
			cancellationToken
		);

		return updated == 0
			? new UpdateSystemJobEnabledResult.NotFound()
			: new UpdateSystemJobEnabledResult.Success(args.DefinitionId, args.IsEnabled);
	}

	public async Task<UpdateSystemJobCronResult> UpdateCronAsync(
		UpdateSystemJobCronArgs args,
		CancellationToken cancellationToken = default
	) {
		if (!CronExpression.IsValidExpression(args.NewCronExpression)) {
			return new UpdateSystemJobCronResult.InvalidCron();
		}

		// NO-DOUBLE-ROTATION: only cron_expression + updated_at are written.
		// RETURNING schedule_epoch proves to callers that the epoch is untouched;
		// the engine rotates it on its next reconcile pass when it detects the
		// cron mismatch against the live trigger.
		var epochs = await dbContext.Database.SqlQuery<Guid>(
			$"""
			UPDATE system_job_definitions
			SET cron_expression = {args.NewCronExpression},
			    updated_at = now()
			WHERE id = {args.DefinitionId} AND is_deleted = false
			RETURNING schedule_epoch AS "Value"
			"""
		).ToListAsync(cancellationToken);

		if (epochs.Count != 1) {
			return new UpdateSystemJobCronResult.NotFound();
		}

		return new UpdateSystemJobCronResult.Success(
			args.DefinitionId,
			args.NewCronExpression,
			epochs[0]
		);
	}

	public async Task<TriggerSystemJobResult> TriggerNowAsync(
		TriggerSystemJobArgs args,
		CancellationToken cancellationToken = default
	) {
		var definition = await (
			from candidate in dbContext.SystemJobDefinition.AsNoTracking()
			where candidate.Id == args.DefinitionId && !candidate.IsDeleted
			select new { candidate.Id, candidate.JobKey }
		).FirstOrDefaultAsync(cancellationToken);
		if (definition is null || definition.Id is null) {
			return new TriggerSystemJobResult.NotFound();
		}

		// Delegates to the SAME seam the cron trigger effectively drives: ledger +
		// queue insert under the engine's own fences, current epoch, never rotated.
		// A freshly-seeded definition with no live Quartz trigger yet (the 60s sync
		// has not run) still enqueues fine: the seeder's gen_random_uuid() epoch is
		// what the first reconcile installs on its trigger, so this occurrence is
		// consistent with the schedule that will exist after it runs.
		var result = await enqueueBoundary.EnqueueNowAsync(
			definition.JobKey, cancellationToken
		);

		return result switch {
			BoundaryResult.Enqueued enqueued => new TriggerSystemJobResult.Enqueued(
				enqueued.JobId,
				enqueued.ScheduledFireAt,
				enqueued.ScheduleEpoch
			),
			BoundaryResult.NoOp => new TriggerSystemJobResult.NoOp(),
			_ => new TriggerSystemJobResult.NotFound(),
		};
	}
}
