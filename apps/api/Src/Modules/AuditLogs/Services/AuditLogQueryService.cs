using System.Collections.Immutable;
using System.Reflection;
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
	string? Action,
	Guid? TargetId,
	DateTime? StartDate,
	DateTime? EndDate
);

public record ExportAuditLogsArgs(
	Guid? UserId,
	string? Action,
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

	Task<IReadOnlyList<string>> GetDistinctActionsAsync(
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

	private static readonly ImmutableArray<string>
		CachedActions =
		[.. typeof(AuditActions)
			.GetFields(
				BindingFlags.Public
				| BindingFlags.Static
				| BindingFlags.FlattenHierarchy
			)
			.Where(f =>
				f.IsLiteral
				&& !f.IsInitOnly
				&& f.FieldType == typeof(string))
			.Select(f =>
				(string)f.GetRawConstantValue()!)
			.Distinct()
			.Order()];

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

		var sortFieldHandlers =
			new Dictionary<string, SortFieldHandler>(
				StringComparer.OrdinalIgnoreCase
			) {
				["created_at"] = new SortFieldHandler(
				getCursorValue: async (guid) => {
					var log = await _dbContext.AuditLog
						.Where(a => a.Id == guid
							&& a.IsDeleted == false)
						.Select(a => new {
							a.CreatedAt,
							a.Id
						})
						.FirstOrDefaultAsync(
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
						? q.Where(a =>
							a.CreatedAt > cursorCreatedAt
							|| (a.CreatedAt
								== cursorCreatedAt
								&& a.Id > cursorId))
						: q.Where(a =>
							a.CreatedAt < cursorCreatedAt
							|| (a.CreatedAt
								== cursorCreatedAt
								&& a.Id < cursorId));
				},
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(a => a.CreatedAt)
						.ThenBy(a => a.Id)
					: q.OrderByDescending(a => a.CreatedAt)
						.ThenByDescending(a => a.Id)
			),
			};

		if (!sortFieldHandlers.TryGetValue(
			effectiveSortId, out SortFieldHandler? handler
		)) {
			return new FindAuditLogsResult.InvalidSortId(
				effectiveSortId
			);
		}

		var query = _dbContext.AuditLog
			.AsNoTracking()
			.Where(a => a.IsDeleted == false
				&& a.Id != null);

		query = ApplyFilters(
			query,
			args.UserId,
			args.Action,
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
				.Where(a => a.Id == id
					&& a.IsDeleted == false)
			join u in _dbContext.User
				.IgnoreQueryFilters()
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

	public Task<IReadOnlyList<string>>
		GetDistinctActionsAsync(
		CancellationToken cancellationToken = default
	) {
		return Task.FromResult<IReadOnlyList<string>>(
			CachedActions
		);
	}

	public async Task<bool> ExportExceedsLimitAsync(
		ExportAuditLogsArgs args,
		CancellationToken cancellationToken = default
	) {
		var limit = AppEnvironment.Instance
			.AUDIT_LOG_EXPORT_MAX_ROWS;

		var query = _dbContext.AuditLog
			.AsNoTracking()
			.Where(a => a.IsDeleted == false
				&& a.Id != null);

		query = ApplyFilters(
			query,
			args.UserId,
			args.Action,
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

		var query = _dbContext.AuditLog
			.AsNoTracking()
			.Where(a => a.IsDeleted == false
				&& a.Id != null);

		query = ApplyFilters(
			query,
			args.UserId,
			args.Action,
			args.TargetId,
			args.StartDate,
			args.EndDate
		);

		var baseQuery = query
			.OrderByDescending(a => a.CreatedAt)
			.ThenByDescending(a => a.Id)
			.Take(limit);

		var exportQuery =
			from a in baseQuery
			join u in _dbContext.User
				.IgnoreQueryFilters()
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
		string? action,
		Guid? targetId,
		DateTime? startDate,
		DateTime? endDate
	) {
		if (userId.HasValue) {
			query = query.Where(a =>
				a.UserId == userId.Value);
		}
		if (action is not null) {
			query = query.Where(a =>
				a.Action == action);
		}
		if (targetId.HasValue) {
			query = query.Where(a =>
				a.TargetId == targetId.Value);
		}
		if (startDate.HasValue) {
			query = query.Where(a =>
				a.CreatedAt >= startDate.Value);
		}
		if (endDate.HasValue) {
			query = query.Where(a =>
				a.CreatedAt <= endDate.Value);
		}
		return query;
	}

	private class SortFieldHandler {
		public Func<Guid, Task<object?>>
			GetCursorValue { get; }
		public Func<
			IQueryable<AuditLog>,
			object?,
			bool,
			IQueryable<AuditLog>
		> ApplyFilter { get; }
		public Func<
			IQueryable<AuditLog>,
			bool,
			IQueryable<AuditLog>
		> ApplyOrdering { get; }

		public SortFieldHandler(
			Func<Guid, Task<object?>> getCursorValue,
			Func<
				IQueryable<AuditLog>,
				object?,
				bool,
				IQueryable<AuditLog>
			> applyFilter,
			Func<
				IQueryable<AuditLog>,
				bool,
				IQueryable<AuditLog>
			> applyOrdering
		) {
			GetCursorValue = getCursorValue;
			ApplyFilter = applyFilter;
			ApplyOrdering = applyOrdering;
		}
	}
}
