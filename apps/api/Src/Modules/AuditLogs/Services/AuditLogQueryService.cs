using System.Runtime.CompilerServices;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.DI;
using MainApi.Src.Modules.AuditLogs.Entities;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.AuditLogs.Services;

public record FindAuditLogsArgs(
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	Guid? UserId,
	IReadOnlyList<string>? Actions,
	Guid? TargetId,
	DateTime? StartDate,
	DateTime? EndDate
);

public record ExportAuditLogsArgs(
	Guid? UserId,
	IReadOnlyList<string>? Actions,
	Guid? TargetId,
	DateTime? StartDate,
	DateTime? EndDate
);

public abstract record FindAuditLogsResult {
	public sealed record Success(
		CursorPaginatedResult<AuditLogListItem> Data
	) : FindAuditLogsResult;

	public sealed record CursorNotFound(
		string Cursor
	) : FindAuditLogsResult;

	public sealed record InvalidSortId(
		string SortId
	) : FindAuditLogsResult;
}

public record AuditLogListItem {
	public required Guid Id { get; init; }
	public required Guid UserId { get; init; }
	public required string UserName { get; init; }
	public required string UserEmail { get; init; }
	public required string Action { get; init; }
	public Guid? TargetId { get; init; }
	public string? IpAddress { get; init; }
	public required DateTime CreatedAt { get; init; }
}

public record AuditLogDetail {
	public required Guid Id { get; init; }
	public required Guid UserId { get; init; }
	public required string UserName { get; init; }
	public required string UserEmail { get; init; }
	public required string Action { get; init; }
	public Guid? TargetId { get; init; }
	public string? Details { get; init; }
	public string? IpAddress { get; init; }
	public string? UserAgent { get; init; }
	public required DateTime CreatedAt { get; init; }
}

public record AuditLogExportItem {
	public required Guid Id { get; init; }
	public required string UserName { get; init; }
	public required string UserEmail { get; init; }
	public required string Action { get; init; }
	public Guid? TargetId { get; init; }
	public string? Details { get; init; }
	public string? IpAddress { get; init; }
	public string? UserAgent { get; init; }
	public required DateTime CreatedAt { get; init; }
}

public interface IAuditLogQueryService {
	Task<FindAuditLogsResult> FindAsync(
		FindAuditLogsArgs args,
		CancellationToken cancellationToken = default);

	Task<AuditLogDetail?> GetByIdAsync(
		Guid id,
		CancellationToken cancellationToken = default);

	ValueTask<IReadOnlyList<string>> GetDistinctActionsAsync(
		CancellationToken cancellationToken = default);

	Task<bool> ExportExceedsLimitAsync(
		ExportAuditLogsArgs args,
		CancellationToken cancellationToken = default);

	IAsyncEnumerable<AuditLogExportItem> ExportAsync(
		ExportAuditLogsArgs args,
		CancellationToken cancellationToken = default);
}

[Service(ServiceLifetime.Scoped)]
public class AuditLogQueryService : IAuditLogQueryService {
	private readonly MainApiDbContext _dbContext;

	public AuditLogQueryService(MainApiDbContext dbContext) {
		_dbContext = dbContext;
	}

	public async Task<FindAuditLogsResult> FindAsync(
		FindAuditLogsArgs args,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit = args.Limit
			?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortOrder =
			args.SortOrder ?? SortOrder.Desc;
		var effectiveSortId = args.SortId ?? "created_at";

		// Keys are public sort_id wire values, not C# property
		// names. Each handler keeps the cursor lookup, page
		// predicate, and ordering in one place so tie-breakers
		// stay consistent.
		var sortFieldHandlers =
			new Dictionary<string, CursorSortFieldHandler<AuditLog>>(
				StringComparer.OrdinalIgnoreCase
			) {
				["created_at"] = new CursorSortFieldHandler<AuditLog>(
				getCursorValue: async (guid) => {
					var log = await (
						from auditLog in _dbContext.AuditLog
							.AsNoTracking()
						where auditLog.Id == guid
							&& auditLog.IsDeleted == false
						select new {
							auditLog.CreatedAt,
							auditLog.Id
						}
					).FirstOrDefaultAsync(
						cancellationToken
					);
					return log is not null
						? (log.CreatedAt, log.Id)
						: null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) {
						return q;
					}
					var (cursorCreatedAt, cursorId) =
						((DateTime, Guid?))cursorValue;
					return isAsc
						? from auditLog in q
							where auditLog.CreatedAt > cursorCreatedAt
							|| (auditLog.CreatedAt
								== cursorCreatedAt
								&& auditLog.Id > cursorId)
							select auditLog
						: from auditLog in q
							where auditLog.CreatedAt < cursorCreatedAt
							|| (auditLog.CreatedAt
								== cursorCreatedAt
								&& auditLog.Id < cursorId)
							select auditLog;
				},
				applyOrdering: (q, isAsc) => isAsc
					? from auditLog in q
						orderby auditLog.CreatedAt, auditLog.Id
						select auditLog
					: from auditLog in q
						orderby auditLog.CreatedAt descending,
							auditLog.Id descending
						select auditLog
			),
			};

		if (!sortFieldHandlers.TryGetValue(
			effectiveSortId, out CursorSortFieldHandler<AuditLog>? handler
		)) {
			return new FindAuditLogsResult.InvalidSortId(
				effectiveSortId
			);
		}

		var query = BaseQuery();

		query = ApplyFilters(
			query,
			args.UserId,
			args.Actions,
			args.TargetId,
			args.StartDate,
			args.EndDate
		);

		if (args.Cursor != Guid.Empty) {
			var cursorValue =
				await handler.GetCursorValue(args.Cursor);
			if (cursorValue is null) {
				return new FindAuditLogsResult.CursorNotFound(
					args.Cursor.ToString()
				);
			}

			query = handler.ApplyFilter(
				query,
				cursorValue,
				effectiveSortOrder == SortOrder.Asc
			);
		}

		var orderedQuery = handler.ApplyOrdering(
			query,
			effectiveSortOrder == SortOrder.Asc
		);

		var projectedQuery =
			from a in orderedQuery
				.Take(effectiveLimit + 1)
			join u in _dbContext.User
				.IgnoreQueryFilters()
				// Audit rows outlive soft-deleted users; keep
				// the historical actor visible when possible.
				on (Guid?)a.UserId equals u.Id
				into userJoin
			from u in userJoin.DefaultIfEmpty()
			select new AuditLogListItem {
				Id = a.Id ?? Guid.Empty,
				UserId = a.UserId,
				UserName = u == null
					? "(deleted user)"
					: u.FirstName != null
						|| u.LastName != null
						? ((u.FirstName ?? "")
							+ " "
							+ (u.LastName ?? ""))
							.Trim()
						: u.Email,
				UserEmail = u == null
					? "(unknown)"
					: u.Email,
				Action = a.Action,
				TargetId = a.TargetId,
				IpAddress = a.IpAddress,
				CreatedAt = a.CreatedAt
			};

		var results = await projectedQuery
			.ToListAsync(cancellationToken);

		string? nextCursor = null;
		if (results.Count > effectiveLimit) {
			results.RemoveAt(results.Count - 1);
			nextCursor = results.Last().Id.ToString();
		}

		return new FindAuditLogsResult.Success(
			new CursorPaginatedResult<AuditLogListItem> {
				Data = results,
				NextCursor = nextCursor,
			}
		);
	}

	public async Task<AuditLogDetail?> GetByIdAsync(
		Guid id,
		CancellationToken cancellationToken = default
	) {
		var detailQuery =
			from a in _dbContext.AuditLog
				.AsNoTracking()
			where a.Id == id
				&& a.IsDeleted == false
			join u in _dbContext.User
				.IgnoreQueryFilters()
				// Audit rows outlive soft-deleted users; keep
				// the historical actor visible when possible.
				on (Guid?)a.UserId equals u.Id
				into userJoin
			from u in userJoin.DefaultIfEmpty()
			select new AuditLogDetail {
				Id = a.Id ?? Guid.Empty,
				UserId = a.UserId,
				UserName = u == null
					? "(deleted user)"
					: u.FirstName != null
						|| u.LastName != null
						? ((u.FirstName ?? "")
							+ " "
							+ (u.LastName ?? ""))
							.Trim()
						: u.Email,
				UserEmail = u == null
					? "(unknown)"
					: u.Email,
				Action = a.Action,
				TargetId = a.TargetId,
				Details = a.Details,
				IpAddress = a.IpAddress,
				UserAgent = a.UserAgent,
				CreatedAt = a.CreatedAt
			};

		return await detailQuery
			.FirstOrDefaultAsync(cancellationToken);
	}

	public ValueTask<IReadOnlyList<string>>
		GetDistinctActionsAsync(
		CancellationToken cancellationToken = default
	) {
		return ValueTask.FromResult(AuditActionsRegistry.All);
	}

	public async Task<bool> ExportExceedsLimitAsync(
		ExportAuditLogsArgs args,
		CancellationToken cancellationToken = default
	) {
		var limit = AppEnvironment.Instance
			.AUDIT_LOG_EXPORT_MAX_ROWS;

		var query = BaseQuery();

		query = ApplyFilters(
			query,
			args.UserId,
			args.Actions,
			args.TargetId,
			args.StartDate,
			args.EndDate
		);

		var count = await query
			.Take(limit + 1)
			.CountAsync(cancellationToken);
		return count > limit;
	}

	public async IAsyncEnumerable<AuditLogExportItem>
		ExportAsync(
		ExportAuditLogsArgs args,
		[EnumeratorCancellation]
		CancellationToken cancellationToken = default
	) {
		var limit = AppEnvironment.Instance
			.AUDIT_LOG_EXPORT_MAX_ROWS;

		var query = BaseQuery();

		query = ApplyFilters(
			query,
			args.UserId,
			args.Actions,
			args.TargetId,
			args.StartDate,
			args.EndDate
		);

		var baseQuery = (
			from auditLog in query
			orderby auditLog.CreatedAt descending,
				auditLog.Id descending
			select auditLog
		).Take(limit);

		var exportQuery =
			from a in baseQuery
			join u in _dbContext.User
				.IgnoreQueryFilters()
				// Audit rows outlive soft-deleted users; keep
				// the historical actor visible when possible.
				on (Guid?)a.UserId equals u.Id
				into userJoin
			from u in userJoin.DefaultIfEmpty()
			select new AuditLogExportItem {
				Id = a.Id ?? Guid.Empty,
				UserName = u == null
					? "(deleted user)"
					: u.FirstName != null
						|| u.LastName != null
						? ((u.FirstName ?? "")
							+ " "
							+ (u.LastName ?? ""))
							.Trim()
						: u.Email,
				UserEmail = u == null
					? "(unknown)"
					: u.Email,
				Action = a.Action,
				TargetId = a.TargetId,
				Details = a.Details,
				IpAddress = a.IpAddress,
				UserAgent = a.UserAgent,
				CreatedAt = a.CreatedAt
			};

		await foreach (var item in exportQuery
			.AsAsyncEnumerable()
			.WithCancellation(cancellationToken)
		) {
			yield return item;
		}
	}

	private static IQueryable<AuditLog> ApplyFilters(
		IQueryable<AuditLog> query,
		Guid? userId,
		IReadOnlyList<string>? actions,
		Guid? targetId,
		DateTime? startDate,
		DateTime? endDate
	) {
		if (userId.HasValue) {
			query =
				from auditLog in query
				where auditLog.UserId == userId.Value
				select auditLog;
		}
		if (actions is { Count: > 0 }) {
			query =
				from auditLog in query
				where actions.Contains(auditLog.Action)
				select auditLog;
		}
		if (targetId.HasValue) {
			query =
				from auditLog in query
				where auditLog.TargetId == targetId.Value
				select auditLog;
		}
		if (startDate.HasValue) {
			query =
				from auditLog in query
				where auditLog.CreatedAt >= startDate.Value
				select auditLog;
		}
		if (endDate.HasValue) {
			query =
				from auditLog in query
				where auditLog.CreatedAt <= endDate.Value
				select auditLog;
		}
		return query;
	}

	private IQueryable<AuditLog> BaseQuery() {
		return
			from auditLog in _dbContext.AuditLog.AsNoTracking()
			where auditLog.IsDeleted == false
				&& auditLog.Id != null
			select auditLog;
	}

}
