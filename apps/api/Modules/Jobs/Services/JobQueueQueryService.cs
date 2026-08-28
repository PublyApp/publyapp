using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Jobs.Entities;

namespace PublyApp.Api.Modules.Jobs.Services;

public record FindJobQueueItemsArgs(
	Guid Cursor,
	int? Limit,
	Guid? TenantId,
	string? StatusCsv,
	string? JobType
);

public abstract record FindJobQueueItemsResult {
	public sealed record Success(
		CursorPaginatedResult<JobQueueListItem> Data
	) : FindJobQueueItemsResult;

	public sealed record InvalidStatusCsv(
		string StatusCsv
	) : FindJobQueueItemsResult;
}

public record JobQueueListItem {
	public required Guid Id { get; init; }
	public required string JobType { get; init; }
	public required string Status { get; init; }
	public required int Priority { get; init; }
	public required int Attempts { get; init; }
	public required int MaxAttempts { get; init; }
	public Guid? TenantId { get; init; }
	public string? LockedBy { get; init; }
	public string? LastError { get; init; }
	public required DateTime NextAttemptAt { get; init; }
	public DateTime? LockedUntil { get; init; }
	public required DateTime CreatedAt { get; init; }
	public required DateTime UpdatedAt { get; init; }
}

// Adds nothing to the stored row (#636): the detail page renders the same
// columns plus provenance/diagnosis fields the list omits.
public record JobQueueItemDetail {
	public required Guid Id { get; init; }
	public required string JobType { get; init; }
	public required string Payload { get; init; }
	public required string Status { get; init; }
	public required int Priority { get; init; }
	public required int Attempts { get; init; }
	public required int MaxAttempts { get; init; }
	public Guid? TenantId { get; init; }
	public Guid? ActorUserId { get; init; }
	public string? CorrelationId { get; init; }
	public string? IdempotencyKey { get; init; }
	public Guid? RequeuedFromDeadLetterId { get; init; }
	public Guid? LockToken { get; init; }
	public string? LockedBy { get; init; }
	public string? LastError { get; init; }
	public required DateTime NextAttemptAt { get; init; }
	public DateTime? LockedUntil { get; init; }
	public required DateTime CreatedAt { get; init; }
	public required DateTime UpdatedAt { get; init; }
}

public interface IJobQueueQueryService {
	Task<FindJobQueueItemsResult> FindAsync(
		FindJobQueueItemsArgs args,
		CancellationToken cancellationToken = default
	);

	Task<JobQueueItemDetail?> GetByIdAsync(
		Guid id,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public class JobQueueQueryService(AppDbContext dbContext) : IJobQueueQueryService {
	private static readonly Dictionary<string, JobQueueStatus>
		StatusCsvValues = new(StringComparer.OrdinalIgnoreCase) {
			["pending"] = JobQueueStatus.Pending,
			["processing"] = JobQueueStatus.Processing,
		};

	public async Task<FindJobQueueItemsResult> FindAsync(
		FindJobQueueItemsArgs args,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit = args.Limit
			?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;

		List<JobQueueStatus>? statuses = null;
		if (!string.IsNullOrWhiteSpace(args.StatusCsv)) {
			statuses = [];
			foreach (var token in args.StatusCsv.Split(',')) {
				if (!StatusCsvValues.TryGetValue(token.Trim(), out var status)) {
					return new FindJobQueueItemsResult.InvalidStatusCsv(args.StatusCsv);
				}

				statuses.Add(status);
			}
		}

		var query = BaseQuery();

		query = ApplyFilters(query, args.TenantId, statuses, args.JobType);

		IQueryable<JobQueueItem> page = query;
		if (args.Cursor != Guid.Empty) {
			var cursorRow = await (
				from item in BaseQuery()
				where item.Id == args.Cursor
				select new { item.CreatedAt }
			).FirstOrDefaultAsync(cancellationToken);
			if (cursorRow is null) {
				// The anchor row is gone (hard delete on success/failure): report an
				// empty tail instead of fabricating a window.
				return new FindJobQueueItemsResult.Success(
					new CursorPaginatedResult<JobQueueListItem>()
				);
			}

			var cursorCreatedAt = cursorRow.CreatedAt;
			page =
				from item in page
				where item.CreatedAt < cursorCreatedAt
					|| (item.CreatedAt == cursorCreatedAt && item.Id < args.Cursor)
				select item;
		}

		var basePage =
			from item in page
			orderby item.CreatedAt descending, item.Id descending
			select item;

		// Project the raw columns first (EF-translateable), then shape wire DTOs
		// in memory — the enum-to-wire-string mapping has no SQL translation.
		var rows = await basePage
			.Take(effectiveLimit + 1)
			.Select(item => new {
				item.Id,
				item.JobType,
				Status = (int)item.Status,
				item.Priority,
				item.Attempts,
				item.MaxAttempts,
				item.TenantId,
				item.LockedBy,
				item.LastError,
				item.NextAttemptAt,
				item.LockedUntil,
				item.CreatedAt,
				item.UpdatedAt,
			})
			.ToListAsync(cancellationToken);

		string? nextCursor = null;
		if (rows.Count > effectiveLimit) {
			rows.RemoveAt(rows.Count - 1);
			nextCursor = rows.Last().Id.ToString();
		}

		var items = rows.Select(row => new JobQueueListItem {
			Id = row.Id ?? Guid.Empty,
			JobType = row.JobType,
			Status = StatusToWire((JobQueueStatus)row.Status),
			Priority = row.Priority,
			Attempts = row.Attempts,
			MaxAttempts = row.MaxAttempts,
			TenantId = row.TenantId,
			LockedBy = row.LockedBy,
			LastError = row.LastError,
			NextAttemptAt = row.NextAttemptAt,
			LockedUntil = row.LockedUntil,
			CreatedAt = row.CreatedAt,
			UpdatedAt = row.UpdatedAt,
		}).ToList();

		return new FindJobQueueItemsResult.Success(
			new CursorPaginatedResult<JobQueueListItem> {
				Data = items,
				NextCursor = nextCursor,
			}
		);
	}

	public async Task<JobQueueItemDetail?> GetByIdAsync(
		Guid id,
		CancellationToken cancellationToken = default
	) {
		var rows = await (
			from item in dbContext.JobQueue.AsNoTracking()
			where item.Id == id
			select new {
				item.Id,
				item.JobType,
				item.Payload,
				Status = (int)item.Status,
				item.Priority,
				item.Attempts,
				item.MaxAttempts,
				item.TenantId,
				item.ActorUserId,
				item.CorrelationId,
				item.IdempotencyKey,
				item.RequeuedFromDeadLetterId,
				item.LockToken,
				item.LockedBy,
				item.LastError,
				item.NextAttemptAt,
				item.LockedUntil,
				item.CreatedAt,
				item.UpdatedAt,
			}
		).ToListAsync(cancellationToken);

		return rows.Select(row => new JobQueueItemDetail {
			Id = row.Id ?? Guid.Empty,
			JobType = row.JobType,
			Payload = row.Payload,
			Status = StatusToWire((JobQueueStatus)row.Status),
			Priority = row.Priority,
			Attempts = row.Attempts,
			MaxAttempts = row.MaxAttempts,
			TenantId = row.TenantId,
			ActorUserId = row.ActorUserId,
			CorrelationId = row.CorrelationId,
			IdempotencyKey = row.IdempotencyKey,
			RequeuedFromDeadLetterId = row.RequeuedFromDeadLetterId,
			LockToken = row.LockToken,
			LockedBy = row.LockedBy,
			LastError = row.LastError,
			NextAttemptAt = row.NextAttemptAt,
			LockedUntil = row.LockedUntil,
			CreatedAt = row.CreatedAt,
			UpdatedAt = row.UpdatedAt,
		}).FirstOrDefault();
	}

	private static string StatusToWire(JobQueueStatus status) {
		return status switch {
			JobQueueStatus.Pending => "pending",
			JobQueueStatus.Processing => "processing",
			_ => status.ToString(),
		};
	}

	private static IQueryable<JobQueueItem> ApplyFilters(
		IQueryable<JobQueueItem> query,
		Guid? tenantId,
		List<JobQueueStatus>? statuses,
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
				where statuses.Contains(item.Status)
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

	private IQueryable<JobQueueItem> BaseQuery() {
		return
			from item in dbContext.JobQueue.AsNoTracking()
			select item;
	}
}
