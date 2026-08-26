using System.Text.Json;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Jobs.Entities;

namespace PublyApp.Api.Modules.Jobs.Services;

public record FindDeadLetterItemsArgs(
	Guid Cursor,
	int? Limit,
	Guid? TenantId,
	string? ExternalStateStatusCsv,
	string? JobType
);

public abstract record FindDeadLetterItemsResult {
	public sealed record Success(
		CursorPaginatedResult<DeadLetterListItem> Data
	) : FindDeadLetterItemsResult;

	public sealed record InvalidStatusCsv(
		string StatusCsv
	) : FindDeadLetterItemsResult;
}

public record DeadLetterListItem {
	public required Guid Id { get; init; }
	public required Guid OriginalJobId { get; init; }
	public required string JobType { get; init; }
	public required int Attempts { get; init; }
	public Guid? TenantId { get; init; }
	public string? LastError { get; init; }
	public required int ExternalStateStatus { get; init; }
	public Guid? RequeuedAsJobId { get; init; }
	public DateTime? RequeuedAt { get; init; }
	public DateTime? TriagedAt { get; init; }
	public required DateTime FailedAt { get; init; }
	public required DateTime CreatedAt { get; init; }
}

public record DeadLetterEventItem {
	public required string Event { get; init; }
	public required string DetectedBy { get; init; }
	public required int PriorStatus { get; init; }
	public required int NewStatus { get; init; }
	public string? Details { get; init; }
	public required DateTime OccurredAt { get; init; }
}

public record DeadLetterDetail {
	public required Guid Id { get; init; }
	public required Guid OriginalJobId { get; init; }
	public required string JobType { get; init; }
	public required string Payload { get; init; }
	public required int Priority { get; init; }
	public required int MaxAttempts { get; init; }
	public required int Attempts { get; init; }
	public Guid? TenantId { get; init; }
	public Guid? ActorUserId { get; init; }
	public string? CorrelationId { get; init; }
	public string? LastError { get; init; }
	public string? LockedBy { get; init; }
	public required int ExternalStateStatus { get; init; }
	public DateTime? ExternalStatePreparedAt { get; init; }
	public DateTime? ExternalStateExpiresAt { get; init; }
	public DateTime? ExternalStateExpiredAt { get; init; }
	public Guid? RequeuedFromDeadLetterId { get; init; }
	public Guid? RequeuedAsJobId { get; init; }
	public DateTime? RequeuedAt { get; init; }
	public DateTime? TriagedAt { get; init; }
	public string? TriagedBy { get; init; }
	public string? TriageNote { get; init; }
	public required IReadOnlyList<DeadLetterEventItem> Events { get; init; }
	public required DateTime EnqueuedAt { get; init; }
	public required DateTime FailedAt { get; init; }
	public required DateTime CreatedAt { get; init; }
}

public sealed record RequeueDeadLetterArgs(Guid DeadLetterId);

/// <summary>
/// Result discriminated union for the staff DLQ requeue (#636). Handlers
/// pattern-match with flat guards (C# coding standards).
/// </summary>
public abstract record RequeueDeadLetterResult {
	/// <summary>One queue row plus one evidence event committed atomically.</summary>
	public sealed record Requeued(
		Guid NewJobId,
		Guid OriginalJobId
	) : RequeueDeadLetterResult;

	/// <summary>No dead-letter row exists for the id.</summary>
	public sealed record NotFound : RequeueDeadLetterResult;

	/// <summary>A concurrent resolver already requeued this row (handler maps to 409).</summary>
	public sealed record AlreadyRequeued : RequeueDeadLetterResult;
}

public interface IDeadLetterQueryService {
	Task<FindDeadLetterItemsResult> FindAsync(
		FindDeadLetterItemsArgs args,
		CancellationToken cancellationToken = default
	);

	Task<DeadLetterDetail?> GetByIdAsync(
		Guid id,
		CancellationToken cancellationToken = default
	);

	Task<RequeueDeadLetterResult> RequeueAsync(
		RequeueDeadLetterArgs args,
		CancellationToken cancellationToken = default
	);
}

/// <summary>
/// Domain service for the staff dead-letter dashboard (#636): list + get reads and
/// the requeue write. The requeue is the ONLY sanctioned writer of a DLQ row's OUT
/// lineage pair (<c>requeued_as_job_id</c>/<c>requeued_at</c>) — it reproduces the
/// full preserved envelope into job_queue, stamps the lineage both ways, appends one
/// <see cref="JobDeadLetterEvents.Requeued"/> evidence event, and commits all three
/// writes in ONE transaction. Audit logging belongs to the handler (Task 7), not
/// here — same separation as <see cref="JobDeadLetterService"/>.
/// </summary>
[Service(ServiceLifetime.Scoped)]
public class DeadLetterQueryService(AppDbContext dbContext) : IDeadLetterQueryService {
	private static readonly Dictionary<string, int>
		StatusCsvValues = new(StringComparer.Ordinal) {
			["0"] = (int)ExternalStateStatus.None,
			["1"] = (int)ExternalStateStatus.Present,
			["2"] = (int)ExternalStateStatus.Expired,
			["3"] = (int)ExternalStateStatus.NeverPrepared,
			["4"] = (int)ExternalStateStatus.Missing,
			["5"] = (int)ExternalStateStatus.Transferred,
			["6"] = (int)ExternalStateStatus.Unclassified,
		};

	public async Task<FindDeadLetterItemsResult> FindAsync(
		FindDeadLetterItemsArgs args,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit = args.Limit
			?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;

		List<int>? statuses = null;
		if (!string.IsNullOrWhiteSpace(args.ExternalStateStatusCsv)) {
			statuses = [];
			foreach (var token in args.ExternalStateStatusCsv.Split(',')) {
				if (!StatusCsvValues.TryGetValue(token.Trim(), out var status)) {
					return new FindDeadLetterItemsResult.InvalidStatusCsv(
						args.ExternalStateStatusCsv
					);
				}

				statuses.Add(status);
			}
		}

		var query = ApplyFilters(
			BaseQuery(), args.TenantId, statuses, args.JobType
		);

		IQueryable<JobDeadLetter> page = query;
		if (args.Cursor != Guid.Empty) {
			var cursorRow = await (
				from item in BaseQuery()
				where item.Id == args.Cursor
				select new { item.FailedAt }
			).FirstOrDefaultAsync(cancellationToken);
			if (cursorRow is null) {
				// The anchor row was swept: an empty tail instead of a fabricated window.
				return new FindDeadLetterItemsResult.Success(
					new CursorPaginatedResult<DeadLetterListItem>()
				);
			}

			var cursorFailedAt = cursorRow.FailedAt;
			page =
				from item in page
				where item.FailedAt < cursorFailedAt
					|| (item.FailedAt == cursorFailedAt && item.Id < args.Cursor)
				select item;
		}

		var rows = await (
			from item in page
			orderby item.FailedAt descending, item.Id descending
			select item
		).Take(effectiveLimit + 1).Select(item => new {
			item.Id,
			item.OriginalJobId,
			item.JobType,
			item.Attempts,
			item.TenantId,
			item.LastError,
			item.ExternalStateStatus,
			item.RequeuedAsJobId,
			item.RequeuedAt,
			item.TriagedAt,
			item.FailedAt,
			item.CreatedAt,
		}).ToListAsync(cancellationToken);

		string? nextCursor = null;
		if (rows.Count > effectiveLimit) {
			rows.RemoveAt(rows.Count - 1);
			nextCursor = rows.Last().Id.ToString();
		}

		var items = rows.Select(row => new DeadLetterListItem {
			Id = row.Id ?? Guid.Empty,
			OriginalJobId = row.OriginalJobId,
			JobType = row.JobType,
			Attempts = row.Attempts,
			TenantId = row.TenantId,
			LastError = row.LastError,
			ExternalStateStatus = row.ExternalStateStatus,
			RequeuedAsJobId = row.RequeuedAsJobId,
			RequeuedAt = row.RequeuedAt,
			TriagedAt = row.TriagedAt,
			FailedAt = row.FailedAt,
			CreatedAt = row.CreatedAt,
		}).ToList();

		return new FindDeadLetterItemsResult.Success(
			new CursorPaginatedResult<DeadLetterListItem> {
				Data = items,
				NextCursor = nextCursor,
			}
		);
	}

	public async Task<DeadLetterDetail?> GetByIdAsync(
		Guid id,
		CancellationToken cancellationToken = default
	) {
		var detail = await (
			from item in dbContext.JobDeadLetter.AsNoTracking()
			where item.Id == id
			select item
		).Select(item => new DeadLetterDetail {
			Id = item.Id ?? Guid.Empty,
			OriginalJobId = item.OriginalJobId,
			JobType = item.JobType,
			Payload = item.Payload,
			Priority = item.Priority,
			MaxAttempts = item.MaxAttempts,
			Attempts = item.Attempts,
			TenantId = item.TenantId,
			ActorUserId = item.ActorUserId,
			CorrelationId = item.CorrelationId,
			LastError = item.LastError,
			LockedBy = item.LockedBy,
			ExternalStateStatus = item.ExternalStateStatus,
			ExternalStatePreparedAt = item.ExternalStatePreparedAt,
			ExternalStateExpiresAt = item.ExternalStateExpiresAt,
			ExternalStateExpiredAt = item.ExternalStateExpiredAt,
			RequeuedFromDeadLetterId = item.RequeuedFromDeadLetterId,
			RequeuedAsJobId = item.RequeuedAsJobId,
			RequeuedAt = item.RequeuedAt,
			TriagedAt = item.TriagedAt,
			TriagedBy = item.TriagedBy,
			TriageNote = item.TriageNote,
			Events = Array.Empty<DeadLetterEventItem>(),
			EnqueuedAt = item.EnqueuedAt,
			FailedAt = item.FailedAt,
			CreatedAt = item.CreatedAt,
		}).FirstOrDefaultAsync(cancellationToken);

		if (detail is null) {
			return null;
		}

		var events = await (
			from evidence in dbContext.JobDeadLetterEvent.AsNoTracking()
			where evidence.DeadLetterId == id
			orderby evidence.OccurredAt descending, evidence.Id descending
			select new DeadLetterEventItem {
				Event = evidence.Event,
				DetectedBy = evidence.DetectedBy,
				PriorStatus = evidence.PriorStatus,
				NewStatus = evidence.NewStatus,
				Details = evidence.Details,
				OccurredAt = evidence.OccurredAt,
			}
		).ToListAsync(cancellationToken);

		return detail with { Events = events };
	}

	public async Task<RequeueDeadLetterResult> RequeueAsync(
		RequeueDeadLetterArgs args,
		CancellationToken cancellationToken = default
	) {
		await using var transaction =
			await dbContext.Database.BeginTransactionAsync(cancellationToken);

		// Lock the row FOR UPDATE so two concurrent requeues serialize here instead
		// of racing past the conditional check below.
		var envelope = await dbContext.Database.SqlQuery<RequeueEnvelope>(
			$"""
			SELECT
				id AS "Id",
				original_job_id AS "OriginalJobId",
				job_type AS "JobType",
				payload AS "Payload",
				priority AS "Priority",
				max_attempts AS "MaxAttempts",
				idempotency_key AS "IdempotencyKey",
				tenant_id AS "TenantId",
				actor_user_id AS "ActorUserId",
				correlation_id AS "CorrelationId",
				requeued_from_dead_letter_id AS "RequeuedFromDeadLetterId",
				external_state_status AS "ExternalStateStatus",
				triaged_at AS "TriagedAt"
			FROM job_dead_letter
			WHERE id = {args.DeadLetterId}
			FOR UPDATE
			"""
		).FirstOrDefaultAsync(cancellationToken);

		if (envelope is null) {
			await transaction.RollbackAsync(cancellationToken);
			return new RequeueDeadLetterResult.NotFound();
		}

		// Reproduce the job faithfully (F16): fresh id/attempt counters, preserved
		// envelope, and the IN lineage copied forward so a re-dead-letter keeps the
		// chain back to the original failure. The INSERT itself lives in the F15
		// enqueue boundary (Infrastructure/Jobs) — this service only orchestrates.
		var newJobId = Guid.NewGuid();
		var inserted = await DeadLetterRequeueEnqueuer.InsertReproducedRowAsync(
			dbContext,
			new DeadLetterRequeueInsert(
				NewJobId: newJobId,
				JobType: envelope.JobType,
				Payload: envelope.Payload,
				Priority: envelope.Priority,
				MaxAttempts: envelope.MaxAttempts,
				IdempotencyKey: envelope.IdempotencyKey,
				TenantId: envelope.TenantId,
				ActorUserId: envelope.ActorUserId,
				CorrelationId: envelope.CorrelationId,
				DeadLetterId: args.DeadLetterId
			),
			cancellationToken
		);
		if (inserted == 0) {
			await transaction.RollbackAsync(cancellationToken);
			return new RequeueDeadLetterResult.AlreadyRequeued();
		}

		// The race guard: only the FIRST requeue of this row can flip the NULL.
		var claimed = await dbContext.Database.ExecuteSqlAsync(
			$"""
			UPDATE job_dead_letter
			SET requeued_as_job_id = {newJobId},
			    requeued_at = now()
			WHERE id = {args.DeadLetterId} AND requeued_as_job_id IS NULL
			""",
			cancellationToken
		);
		if (claimed == 0) {
			// A concurrent resolver won; roll our queue row back and fail closed.
			await transaction.RollbackAsync(cancellationToken);
			return new RequeueDeadLetterResult.AlreadyRequeued();
		}

		dbContext.JobDeadLetterEvent.Add(new JobDeadLetterEvent {
			DeadLetterId = args.DeadLetterId,
			Event = JobDeadLetterEvents.Requeued,
			DetectedBy = "operator",
			PriorStatus = envelope.ExternalStateStatus,
			NewStatus = envelope.ExternalStateStatus,
			OccurredAt = DateTime.UtcNow,
			Details = JsonSerializer.Serialize(new {
				newJobId,
				originalJobId = envelope.OriginalJobId,
				note = "staff trigger-now requeue",
			}),
		});
		await dbContext.SaveChangesAsync(cancellationToken);

		await transaction.CommitAsync(cancellationToken);

		return new RequeueDeadLetterResult.Requeued(
			newJobId,
			envelope.OriginalJobId
		);
	}

	private IQueryable<JobDeadLetter> BaseQuery() {
		return
			from item in dbContext.JobDeadLetter.AsNoTracking()
			select item;
	}

	private static IQueryable<JobDeadLetter> ApplyFilters(
		IQueryable<JobDeadLetter> query,
		Guid? tenantId,
		List<int>? statuses,
		string? jobType
	) {
		if (tenantId.HasValue) {
			query =
				from item in query
				where item.TenantId == tenantId.Value
				select item;
		}

		if (statuses is { Count: > 0 }) {
			query =
				from item in query
				where statuses.Contains(item.ExternalStateStatus)
				select item;
		}

		if (!string.IsNullOrEmpty(jobType)) {
			query =
				from item in query
				where item.JobType == jobType
				select item;
		}

		return query;
	}

	private sealed class RequeueEnvelope {
		public Guid Id { get; set; }
		public Guid OriginalJobId { get; set; }
		public string JobType { get; set; } = string.Empty;
		public string Payload { get; set; } = "{}";
		public int Priority { get; set; }
		public int MaxAttempts { get; set; }
		public string? IdempotencyKey { get; set; }
		public Guid? TenantId { get; set; }
		public Guid? ActorUserId { get; set; }
		public string? CorrelationId { get; set; }
		public Guid? RequeuedFromDeadLetterId { get; set; }
		public int ExternalStateStatus { get; set; }
		public DateTime? TriagedAt { get; set; }
	}
}
