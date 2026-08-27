using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.SystemNotices.Entities;

namespace PublyApp.Api.Modules.SystemNotices.Services;

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

public record FindSystemNoticesArgs(
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder
);

public interface ISystemNoticeService {
	Task<SystemNotice> CreateAsync(
		CreateSystemNoticeArgs args,
		CancellationToken cancellationToken = default);

	Task<FindSystemNoticesResult> FindAsync(
		FindSystemNoticesArgs args,
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
	private readonly AppDbContext _dbContext;
	private readonly ILogger<SystemNoticeService> _logger;

	public SystemNoticeService(
		AppDbContext dbContext,
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
		FindSystemNoticesArgs args,
		CancellationToken cancellationToken = default
	) {
		var cursor = args.Cursor;
		var effectiveLimit = args.Limit
			?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortOrder = args.SortOrder ?? SortOrder.Desc;
		var effectiveSortId = args.SortId ?? "created_at";

		var sortFieldHandlers =
			new Dictionary<string, CursorSortFieldHandler<SystemNotice>>(
				StringComparer.OrdinalIgnoreCase
			) {
				["created_at"] = CursorSortFieldHandlerFactory.Create<SystemNotice, DateTime, Guid?>(
					cursorLookupQuery: () => _dbContext.SystemNotice
						.AsNoTracking()
						.Where(n => !n.IsDeleted),
					keySelector: n => n.CreatedAt,
					idSelector: n => n.Id,
					cancellationToken
				),
				["starts_at"] = CursorSortFieldHandlerFactory.Create<SystemNotice, DateTime, Guid?>(
					cursorLookupQuery: () => _dbContext.SystemNotice
						.AsNoTracking()
						.Where(n => !n.IsDeleted),
					keySelector: n => n.StartsAt,
					idSelector: n => n.Id,
					cancellationToken
				),
				["severity"] = CursorSortFieldHandlerFactory.Create<SystemNotice, NoticeSeverity, Guid?>(
					cursorLookupQuery: () => _dbContext.SystemNotice
						.AsNoTracking()
						.Where(n => !n.IsDeleted),
					keySelector: n => n.Severity,
					idSelector: n => n.Id,
					cancellationToken
				),
			};

		if (!sortFieldHandlers.TryGetValue(
			effectiveSortId, out CursorSortFieldHandler<SystemNotice>? handler
		)) {
			return new FindSystemNoticesResult.InvalidSortId(
				effectiveSortId
			);
		}

		var query = _dbContext.SystemNotice
			.AsNoTracking()
			.Where(n => !n.IsDeleted && n.Id != null);

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
			where n.Id == id && !n.IsDeleted
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
			where n.Id == id && !n.IsDeleted
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
			where n.Id == id && !n.IsDeleted
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
			where !n.IsDeleted
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

}
