using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Jobs.Entities;

namespace PublyApp.Api.Modules.Jobs.Services;

public record FindJobQueueItemsArgs(
	Guid Cursor,
	int? Limit,
	Guid? TenantId,
	string? StatusCsv,
	string? JobType,
	string? Search
);

public sealed record JobQueueCounts(
	int Total,
	int Pending,
	int Processing,
	int Retrying
);

public abstract record FindJobQueueItemsResult {
	public sealed record Success(
		CursorPaginatedResult<JobQueueListItem> Data,
		JobQueueCounts Counts
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
	public string? TenantName { get; init; }
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
		_StatusCsvValues = new(StringComparer.OrdinalIgnoreCase) {
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
				if (!JobQueueQueryService._StatusCsvValues.TryGetValue(token.Trim(), out var status)) {
					return new FindJobQueueItemsResult.InvalidStatusCsv(args.StatusCsv);
				}

				statuses.Add(status);
			}
		}

		var query = this._BaseQuery();

		query = JobQueueQueryService._ApplyFilters(query, args.TenantId, statuses, args.JobType);

		if (args.Search is { } search) {
			var trimmed = search.Trim();
			if (trimmed.Length > 0) {
				var pattern = $"%{LikePatternUtils.EscapeLikePattern(trimmed)}%";
				query = query.Where(item =>
					EF.Functions.ILike(item.JobType, pattern, LikePatternUtils.LikeEscapeChar)
					|| (item.LastError != null && EF.Functions.ILike(item.LastError, pattern, LikePatternUtils.LikeEscapeChar))
					|| (item.TenantId.HasValue && dbContext.Tenant.Any(tenant =>
						tenant.Id == item.TenantId
						&& EF.Functions.ILike(tenant.Name, pattern, LikePatternUtils.LikeEscapeChar)))
				);
			}
		}

		// Facets describe the whole filtered collection: cursor and limit are
		// pagination only.
		var statusFacets = await (
			from item in query
			group item by item.Status into g
			select new { Status = g.Key, Count = g.Count() }
		).ToListAsync(cancellationToken);

		var total = 0;
		var pending = 0;
		var processing = 0;
		foreach (var facet in statusFacets) {
			total += facet.Count;
			if (facet.Status == JobQueueStatus.Pending) {
				pending += facet.Count;
			} else if (facet.Status == JobQueueStatus.Processing) {
				processing += facet.Count;
			}
		}

		var retrying = await query.CountAsync(
			item => item.Attempts > 0,
			cancellationToken
		);

		var counts = new JobQueueCounts(
			Total: total,
			Pending: pending,
			Processing: processing,
			Retrying: retrying
		);

		IQueryable<JobQueueItem> page = query;
		if (args.Cursor != Guid.Empty) {
			var cursorRow = await (
				from item in this._BaseQuery()
				where item.Id == args.Cursor
				select new { item.CreatedAt }
			).FirstOrDefaultAsync(cancellationToken);
			if (cursorRow is null) {
				// The anchor row is gone (hard delete on success/failure): report an
				// empty tail instead of fabricating a window.
				return new FindJobQueueItemsResult.Success(
					new CursorPaginatedResult<JobQueueListItem>(),
					counts
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
				TenantName = dbContext.Tenant
					.Where(tenant => tenant.Id == item.TenantId)
					.Select(tenant => tenant.Name)
					.FirstOrDefault(),
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
			Status = JobQueueQueryService._StatusToWire((JobQueueStatus)row.Status),
			Priority = row.Priority,
			Attempts = row.Attempts,
			MaxAttempts = row.MaxAttempts,
			TenantId = row.TenantId,
			TenantName = row.TenantName,
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
			},
			counts
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
			Status = JobQueueQueryService._StatusToWire((JobQueueStatus)row.Status),
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

	private static string _StatusToWire(JobQueueStatus status) {
		return status switch {
			JobQueueStatus.Pending => "pending",
			JobQueueStatus.Processing => "processing",
			_ => status.ToString(),
		};
	}

	private static IQueryable<JobQueueItem> _ApplyFilters(
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

	private IQueryable<JobQueueItem> _BaseQuery() {
		return
			from item in dbContext.JobQueue.AsNoTracking()
			select item;
	}
}
