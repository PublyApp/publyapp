using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.DI;
using MainApi.Src.Modules.SystemNotices.Entities;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.SystemNotices.Services;

public record CreateSystemNoticeArgs(
	NoticeSeverity Severity,
	string Title,
	string Message,
	DateTime StartsAt,
	DateTime? ExpiresAt,
	Guid CreatedByStaffId
);

public record UpdateSystemNoticeArgs(
	NoticeSeverity? Severity,
	string? Title,
	string? Message,
	DateTime? StartsAt,
	PatchField<DateTime?> ExpiresAt
);

public interface ISystemNoticeService {
	Task<SystemNotice> CreateAsync(
		CreateSystemNoticeArgs args,
		CancellationToken cancellationToken = default);

	Task<FindSystemNoticesResult> FindAsync(
		Guid cursor,
		int? limit = null,
		string? sortId = null,
		SortOrder? sortOrder = null,
		CancellationToken cancellationToken = default);

	Task<SystemNotice?> GetByIdAsync(
		Guid id,
		CancellationToken cancellationToken = default);

	Task<SystemNotice?> UpdateAsync(
		Guid id,
		UpdateSystemNoticeArgs args,
		CancellationToken cancellationToken = default);

	Task<bool> DeleteAsync(
		Guid id,
		CancellationToken cancellationToken = default);

	Task<List<ActiveSystemNotice>> GetActiveAsync(
		CancellationToken cancellationToken = default);
}

public abstract record FindSystemNoticesResult {
	public sealed record Success(
		CursorPaginatedResult<SystemNoticeListItem> Data
	) : FindSystemNoticesResult;

	public sealed record CursorNotFound(
		string Cursor
	) : FindSystemNoticesResult;

	public sealed record InvalidSortId(
		string SortId
	) : FindSystemNoticesResult;
}

public record SystemNoticeListItem {
	public required Guid Id { get; init; }
	public required string Severity { get; init; }
	public required string Title { get; init; }
	public required DateTime StartsAt { get; init; }
	public DateTime? ExpiresAt { get; init; }
	public required bool IsActive { get; init; }
	public required DateTime CreatedAt { get; init; }
}

public record ActiveSystemNotice {
	public required Guid Id { get; init; }
	public required string Severity { get; init; }
	public required string Title { get; init; }
	public required string Message { get; init; }
	public DateTime? ExpiresAt { get; init; }
}

[Service(ServiceLifetime.Scoped)]
public class SystemNoticeService : ISystemNoticeService {
	private readonly MainApiDbContext _dbContext;
	private readonly ILogger<SystemNoticeService> _logger;

	public SystemNoticeService(
		MainApiDbContext dbContext,
		ILogger<SystemNoticeService> logger
	) {
		_dbContext = dbContext;
		_logger = logger;
	}

	public async Task<SystemNotice> CreateAsync(
		CreateSystemNoticeArgs args,
		CancellationToken cancellationToken = default
	) {
		var notice = new SystemNotice {
			Severity = args.Severity,
			Title = args.Title,
			Message = args.Message,
			StartsAt = args.StartsAt,
			ExpiresAt = args.ExpiresAt,
			CreatedByStaffId = args.CreatedByStaffId
		};

		await _dbContext.SystemNotice.AddAsync(
			notice, cancellationToken
		);
		await _dbContext.SaveChangesAsync(cancellationToken);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"Created system notice {NoticeId} "
				+ "with severity {Severity} "
				+ "by staff {StaffId}",
				notice.Id,
				args.Severity,
				args.CreatedByStaffId
			);
		}

		return notice;
	}

	public async Task<FindSystemNoticesResult> FindAsync(
		Guid cursor,
		int? limit = null,
		string? sortId = null,
		SortOrder? sortOrder = null,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit = limit
			?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortOrder = sortOrder ?? SortOrder.Desc;
		var effectiveSortId = (sortId ?? "created_at")
			.ToLowerInvariant();

		var sortFieldHandlers =
			new Dictionary<string, SortFieldHandler> {
				["created_at"] = new SortFieldHandler(
				getCursorValue: async (guid) => {
					var notice = await _dbContext.SystemNotice
						.Where(n => n.Id == guid
							&& n.IsDeleted == false)
						.Select(n => new { n.CreatedAt, n.Id })
						.FirstOrDefaultAsync(cancellationToken);
					return notice is not null
						? (notice.CreatedAt, notice.Id)
						: null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) {
						return q;
					}
					var (cursorCreatedAt, cursorId) =
						((DateTime, Guid?))cursorValue;
					return isAsc
						? q.Where(n =>
							n.CreatedAt > cursorCreatedAt
							|| (n.CreatedAt == cursorCreatedAt
								&& n.Id > cursorId))
						: q.Where(n =>
							n.CreatedAt < cursorCreatedAt
							|| (n.CreatedAt == cursorCreatedAt
								&& n.Id < cursorId));
				},
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(n => n.CreatedAt)
						.ThenBy(n => n.Id)
					: q.OrderByDescending(n => n.CreatedAt)
						.ThenByDescending(n => n.Id)
			),
				["starts_at"] = new SortFieldHandler(
				getCursorValue: async (guid) => {
					var notice = await _dbContext.SystemNotice
						.Where(n => n.Id == guid
							&& n.IsDeleted == false)
						.Select(n => new { n.StartsAt, n.Id })
						.FirstOrDefaultAsync(cancellationToken);
					return notice is not null
						? (notice.StartsAt, notice.Id)
						: null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) {
						return q;
					}
					var (cursorStartsAt, cursorId) =
						((DateTime, Guid?))cursorValue;
					return isAsc
						? q.Where(n =>
							n.StartsAt > cursorStartsAt
							|| (n.StartsAt == cursorStartsAt
								&& n.Id > cursorId))
						: q.Where(n =>
							n.StartsAt < cursorStartsAt
							|| (n.StartsAt == cursorStartsAt
								&& n.Id < cursorId));
				},
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(n => n.StartsAt)
						.ThenBy(n => n.Id)
					: q.OrderByDescending(n => n.StartsAt)
						.ThenByDescending(n => n.Id)
			),
				["severity"] = new SortFieldHandler(
				getCursorValue: async (guid) => {
					var notice = await _dbContext.SystemNotice
						.Where(n => n.Id == guid
							&& n.IsDeleted == false)
						.Select(n => new { n.Severity, n.Id })
						.FirstOrDefaultAsync(cancellationToken);
					return notice is not null
						? ((int)notice.Severity, notice.Id)
						: null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) {
						return q;
					}
					var (cursorSeverity, cursorId) =
						((int, Guid?))cursorValue;
					return isAsc
						? q.Where(n =>
							(int)n.Severity > cursorSeverity
							|| ((int)n.Severity == cursorSeverity
								&& n.Id > cursorId))
						: q.Where(n =>
							(int)n.Severity < cursorSeverity
							|| ((int)n.Severity == cursorSeverity
								&& n.Id < cursorId));
				},
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(n => n.Severity)
						.ThenBy(n => n.Id)
					: q.OrderByDescending(n => n.Severity)
						.ThenByDescending(n => n.Id)
			),
			};

		if (!sortFieldHandlers.TryGetValue(
			effectiveSortId, out SortFieldHandler? handler
		)) {
			return new FindSystemNoticesResult.InvalidSortId(
				effectiveSortId
			);
		}

		var query = _dbContext.SystemNotice
			.Where(n => n.IsDeleted == false && n.Id != null);

		if (cursor != Guid.Empty) {
			var cursorValue = await handler.GetCursorValue(cursor);
			if (cursorValue is null) {
				return new FindSystemNoticesResult.CursorNotFound(
					cursor.ToString()
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

		var results = await orderedQuery
			.Take(effectiveLimit + 1)
			.ToListAsync(cancellationToken);

		string? nextCursor = null;
		if (results.Count > effectiveLimit) {
			results.RemoveAt(results.Count - 1);
			nextCursor = results.Last().GetRequiredId().ToString();
		}

		var now = DateTime.UtcNow;
		var items = results.Select(n => new SystemNoticeListItem {
			Id = n.GetRequiredId(),
			Severity = n.Severity.ToString().ToLowerInvariant(),
			Title = n.Title,
			StartsAt = n.StartsAt,
			ExpiresAt = n.ExpiresAt,
			IsActive = n.IsActive(),
			CreatedAt = n.CreatedAt
		}).ToList();

		return new FindSystemNoticesResult.Success(
			new CursorPaginatedResult<SystemNoticeListItem> {
				Data = items,
				NextCursor = nextCursor,
			}
		);
	}

	public async Task<SystemNotice?> GetByIdAsync(
		Guid id,
		CancellationToken cancellationToken = default
	) {
		var noticeQuery =
			from n in _dbContext.SystemNotice
			where n.Id == id && n.IsDeleted == false
			select n;

		return await noticeQuery
			.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<SystemNotice?> UpdateAsync(
		Guid id,
		UpdateSystemNoticeArgs args,
		CancellationToken cancellationToken = default
	) {
		var notice = await (
			from n in _dbContext.SystemNotice
			where n.Id == id && n.IsDeleted == false
			select n
		).FirstOrDefaultAsync(cancellationToken);

		if (notice is null) {
			return null;
		}

		if (args.Severity.HasValue) {
			notice.Severity = args.Severity.Value;
		}
		if (args.Title is not null) {
			notice.Title = args.Title;
		}
		if (args.Message is not null) {
			notice.Message = args.Message;
		}
		if (args.StartsAt.HasValue) {
			notice.StartsAt = args.StartsAt.Value;
		}
		if (args.ExpiresAt.IsPresent) {
			notice.ExpiresAt = args.ExpiresAt.Value;
		}

		await _dbContext.SaveChangesAsync(cancellationToken);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"Updated system notice {NoticeId}",
				id
			);
		}

		return notice;
	}

	public async Task<bool> DeleteAsync(
		Guid id,
		CancellationToken cancellationToken = default
	) {
		var notice = await (
			from n in _dbContext.SystemNotice
			where n.Id == id && n.IsDeleted == false
			select n
		).FirstOrDefaultAsync(cancellationToken);

		if (notice is null) {
			return false;
		}

		_dbContext.SystemNotice.Remove(notice);
		await _dbContext.SaveChangesAsync(cancellationToken);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"Deleted system notice {NoticeId}",
				id
			);
		}

		return true;
	}

	public async Task<List<ActiveSystemNotice>> GetActiveAsync(
		CancellationToken cancellationToken = default
	) {
		var now = DateTime.UtcNow;

		var activeNoticesQuery =
			from n in _dbContext.SystemNotice
			where n.IsDeleted == false
				&& n.StartsAt <= now
				&& (n.ExpiresAt == null || n.ExpiresAt > now)
			orderby n.Severity descending, n.StartsAt descending
			select new ActiveSystemNotice {
				Id = n.Id ?? Guid.Empty,
				Severity = n.Severity.ToString()
					.ToLowerInvariant(),
				Title = n.Title,
				Message = n.Message,
				ExpiresAt = n.ExpiresAt
			};

		return await activeNoticesQuery
			.ToListAsync(cancellationToken);
	}

	private class SortFieldHandler {
		public Func<Guid, Task<object?>> GetCursorValue { get; }
		public Func<
			IQueryable<SystemNotice>,
			object?,
			bool,
			IQueryable<SystemNotice>
		> ApplyFilter { get; }
		public Func<
			IQueryable<SystemNotice>,
			bool,
			IQueryable<SystemNotice>
		> ApplyOrdering { get; }

		public SortFieldHandler(
			Func<Guid, Task<object?>> getCursorValue,
			Func<
				IQueryable<SystemNotice>,
				object?,
				bool,
				IQueryable<SystemNotice>
			> applyFilter,
			Func<
				IQueryable<SystemNotice>,
				bool,
				IQueryable<SystemNotice>
			> applyOrdering
		) {
			GetCursorValue = getCursorValue;
			ApplyFilter = applyFilter;
			ApplyOrdering = applyOrdering;
		}
	}
}
